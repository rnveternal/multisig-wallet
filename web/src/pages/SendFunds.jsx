import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Contract, isAddress, parseEther, parseUnits, formatEther, BrowserProvider } from "ethers";
import { useWallet } from "../lib/WalletContext";
import {
  MULTISIG_ABI,
  ERC20_ABI,
  encodeErc20Transfer,
  packSignatures,
  eip712Domain,
  EIP712_TYPES,
} from "../lib/multisig";
import QRDisplay from "../components/QRDisplay";
import QRScanner from "../components/QRScanner";

function short(addr) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

export default function SendFunds() {
  const { account, provider, chainId, connect } = useWallet();
  const [params] = useSearchParams();

  const [walletAddress, setWalletAddress] = useState(params.get("wallet") || "");
  const [info, setInfo] = useState(null); // { owners, threshold, nonce }
  const [loadingInfo, setLoadingInfo] = useState(false);

  // --- transaction mode: native coin vs ERC20 token ---
  const [mode, setMode] = useState("native"); // "native" | "token"

  // native mode fields
  const [nativeTo, setNativeTo] = useState("");
  const [nativeAmount, setNativeAmount] = useState("0");

  // token mode fields
  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenRecipient, setTokenRecipient] = useState("");
  const [tokenAmount, setTokenAmount] = useState("0");
  const [tokenMeta, setTokenMeta] = useState(null); // { decimals, symbol }
  const [tokenMetaError, setTokenMetaError] = useState(null);
  const [loadingToken, setLoadingToken] = useState(false);

  const [built, setBuilt] = useState(null); // frozen tx payload once QR is generated
  const [buildError, setBuildError] = useState(null);

  const [signatures, setSignatures] = useState([]); // [{signer, signature}]
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);

  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState(null);
  const [execTxHash, setExecTxHash] = useState(null);

  const contract = useMemo(() => {
    if (!provider || !walletAddress || !isAddress(walletAddress)) return null;
    return new Contract(walletAddress, MULTISIG_ABI, provider);
  }, [provider, walletAddress]);

  async function loadInfo() {
    if (!contract) return;
    setLoadingInfo(true);
    try {
      const [owners, threshold, nonce] = await Promise.all([
        contract.getOwners(),
        contract.threshold(),
        contract.nonce(),
      ]);
      setInfo({ owners, threshold: Number(threshold), nonce: Number(nonce) });
    } catch (e) {
      setInfo(null);
    } finally {
      setLoadingInfo(false);
    }
  }

  useEffect(() => {
    loadInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract]);

  // Look up token decimals/symbol as soon as a valid token address is entered,
  // so the amount field can be filled in normal human units (e.g. "100"),
  // not raw base units.
  useEffect(() => {
    setTokenMeta(null);
    setTokenMetaError(null);
    if (mode !== "token" || !provider || !isAddress(tokenAddress)) return;
    let cancelled = false;
    setLoadingToken(true);
    (async () => {
      try {
        const token = new Contract(tokenAddress, ERC20_ABI, provider);
        const [decimals, symbol] = await Promise.all([token.decimals(), token.symbol()]);
        if (!cancelled) setTokenMeta({ decimals: Number(decimals), symbol });
      } catch (e) {
        if (!cancelled) setTokenMetaError("Gagal baca metadata token — pastikan address contract ERC20 valid di chain ini.");
      } finally {
        if (!cancelled) setLoadingToken(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, tokenAddress, provider]);

  function buildQrPayload() {
    setBuildError(null);
    if (!info) return;

    let to, valueWei, data, displayNote;
    try {
      if (mode === "native") {
        if (!isAddress(nativeTo)) throw new Error("Address tujuan tidak valid.");
        to = nativeTo;
        valueWei = parseEther(nativeAmount || "0").toString();
        data = "0x";
        displayNote = `Kirim ${nativeAmount} native token`;
      } else {
        if (!isAddress(tokenAddress)) throw new Error("Address token contract tidak valid.");
        if (!isAddress(tokenRecipient)) throw new Error("Address tujuan tidak valid.");
        if (!tokenMeta) throw new Error("Metadata token belum termuat — tunggu sebentar atau cek address contract.");
        const amountRaw = parseUnits(tokenAmount || "0", tokenMeta.decimals);
        to = tokenAddress;
        valueWei = "0";
        data = encodeErc20Transfer(tokenRecipient, amountRaw);
        displayNote = `Transfer ${tokenAmount} ${tokenMeta.symbol} ke ${short(tokenRecipient)}`;
      }
    } catch (e) {
      setBuildError(e.message || "Input transaksi tidak valid.");
      return;
    }

    setBuilt({
      walletName: "MultiSigWallet",
      version: "1",
      chainId,
      verifyingContract: walletAddress,
      to,
      value: valueWei,
      data,
      nonce: info.nonce,
      // display-only fields, not part of the signed struct, just so signer.html
      // and the coordinator can show something readable instead of raw hex:
      kind: mode,
      note: displayNote,
      ...(mode === "token"
        ? { tokenSymbol: tokenMeta.symbol, tokenAmount, tokenRecipient }
        : {}),
    });
    setSignatures([]);
    setExecTxHash(null);
    setExecError(null);
  }

  // Shared validation for any signature entering the pool, whether it came
  // from a scanned QR (remote owner) or was signed right here in this
  // browser tab (co-located owner). Returns an error string, or null on
  // success (and pushes the signature into state).
  function addSignature(parsed, setErrorFn) {
    if (!parsed.signature || !parsed.signer) {
      setErrorFn("Data ini bukan hasil tanda tangan yang valid.");
      return;
    }
    // Sanity-check the signature is for THIS exact transaction, not a stale one.
    if (
      String(parsed.to).toLowerCase() !== String(built.to).toLowerCase() ||
      String(parsed.nonce) !== String(built.nonce) ||
      String(parsed.value) !== String(built.value) ||
      String(parsed.data) !== String(built.data) ||
      Number(parsed.chainId) !== Number(built.chainId) ||
      String(parsed.verifyingContract).toLowerCase() !== String(built.verifyingContract).toLowerCase()
    ) {
      setErrorFn("Signature ini untuk transaksi berbeda (to/value/data/nonce tidak cocok) — minta owner tanda tangan ulang transaksi yang sedang aktif.");
      return;
    }
    const signerLower = parsed.signer.toLowerCase();
    if (!info.owners.some((o) => o.toLowerCase() === signerLower)) {
      setErrorFn(`Address ${short(parsed.signer)} bukan owner wallet ini.`);
      return;
    }
    if (signatures.some((s) => s.signer.toLowerCase() === signerLower)) {
      setErrorFn(`${short(parsed.signer)} sudah tanda tangan sebelumnya.`);
      return;
    }
    setErrorFn(null);
    setSignatures((prev) => [...prev, { signer: parsed.signer, signature: parsed.signature }]);
  }

  function handleScanResult(text) {
    setScanning(false);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      setScanError("QR tidak berisi data signature yang valid (bukan JSON).");
      return;
    }
    addSignature(parsed, setScanError);
  }

  // Direct in-browser signing: for an owner physically sitting at THIS
  // computer, switch to their account in the wallet extension (MetaMask
  // etc — click the extension icon, pick the account), then sign here.
  // No camera, no QR round-trip needed.
  const [directSigning, setDirectSigning] = useState(false);
  const [directError, setDirectError] = useState(null);

  async function signHere() {
    if (!provider || !built) return;
    setDirectSigning(true);
    setDirectError(null);
    try {
      // IMPORTANT: without this, MetaMask keeps handing back whichever
      // account was authorized on the FIRST connect, even if the user has
      // since switched the active account in the extension UI. Forcing the
      // permission prompt every time lets the person pick a different owner
      // account right here.
      if (window.ethereum?.request) {
        try {
          await window.ethereum.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          });
        } catch (permErr) {
          // Some wallets (Rabby, some mobile wallets) don't support this
          // method — ignore and fall back to whatever account is already
          // authorized instead of hard-failing.
        }
      }
      // Build a fresh BrowserProvider so we're not reading a stale signer
      // cached from before the permission prompt above.
      const freshProvider = new BrowserProvider(window.ethereum);
      const signer = await freshProvider.getSigner();
      const signerAddress = await signer.getAddress();
      const domain = eip712Domain(built.chainId, built.verifyingContract);
      const message = { to: built.to, value: built.value, data: built.data, nonce: built.nonce };
      const signature = await signer.signTypedData(domain, EIP712_TYPES, message);
      addSignature(
        {
          signer: signerAddress,
          signature,
          to: built.to,
          value: built.value,
          data: built.data,
          nonce: built.nonce,
          chainId: built.chainId,
          verifyingContract: built.verifyingContract,
        },
        setDirectError
      );
    } catch (e) {
      setDirectError(e.shortMessage || e.reason || e.message || "Tanda tangan dibatalkan atau gagal.");
    } finally {
      setDirectSigning(false);
    }
  }

  async function handleExecute() {
    if (!provider || !info || !built || signatures.length < info.threshold) return;
    setExecuting(true);
    setExecError(null);
    try {
      const signer = await provider.getSigner();
      const writable = new Contract(walletAddress, MULTISIG_ABI, signer);
      const packed = packSignatures(signatures);
      const valueWei = BigInt(built.value);
      // Simulate first so a bad/stale signature is caught before spending gas.
      await writable.executeTransaction.staticCall(built.to, valueWei, built.data, packed);
      const tx = await writable.executeTransaction(built.to, valueWei, built.data, packed);
      setExecTxHash(tx.hash);
      await tx.wait();
      await loadInfo();
    } catch (e) {
      setExecError(e.shortMessage || e.reason || e.message || "Eksekusi gagal");
    } finally {
      setExecuting(false);
    }
  }

  if (!account) {
    return (
      <div className="card">
        <h2>Kirim Dana</h2>
        <p className="muted">Connect Wallet A dulu.</p>
        <button onClick={connect}>Connect Wallet A</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <h2>Kirim Dana — MultiSig Wallet</h2>
        <label>Address MultiSig Wallet</label>
        <input value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} placeholder="0x..." />
        {loadingInfo && <p className="muted" style={{ fontSize: 12 }}>Memuat info wallet...</p>}
        {info && (
          <div className="row wrap" style={{ marginTop: 10 }}>
            <span className="badge">{info.owners.length} owners</span>
            <span className="badge">threshold {info.threshold}</span>
            <span className="badge">nonce {info.nonce}</span>
          </div>
        )}
        {!info && !loadingInfo && walletAddress && isAddress(walletAddress) && (
          <div className="alert error">Contract tidak ditemukan di chain ID {chainId} saat ini — pastikan Wallet A sedang di network yang benar.</div>
        )}
      </div>

      {info && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>1. Detail Transaksi</h3>

          <div className="row" style={{ marginBottom: 12 }}>
            <button
              className={mode === "native" ? "" : "secondary"}
              onClick={() => setMode("native")}
            >
              Native Token
            </button>
            <button
              className={mode === "token" ? "" : "secondary"}
              onClick={() => setMode("token")}
            >
              Kirim Token (ERC20)
            </button>
          </div>

          {mode === "native" ? (
            <div className="grid cols-2">
              <div>
                <label>Kirim ke</label>
                <input value={nativeTo} onChange={(e) => setNativeTo(e.target.value)} placeholder="0x..." />
              </div>
              <div>
                <label>Jumlah (native token)</label>
                <input value={nativeAmount} onChange={(e) => setNativeAmount(e.target.value)} placeholder="0.0" />
              </div>
            </div>
          ) : (
            <>
              <label>Address Token Contract</label>
              <input value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} placeholder="0x... (contract ERC20)" />
              {loadingToken && <p className="muted" style={{ fontSize: 12 }}>Membaca metadata token...</p>}
              {tokenMeta && (
                <div className="row wrap" style={{ margin: "8px 0" }}>
                  <span className="badge good">{tokenMeta.symbol}</span>
                  <span className="badge">{tokenMeta.decimals} decimals</span>
                </div>
              )}
              {tokenMetaError && <div className="alert error">{tokenMetaError}</div>}

              <div className="grid cols-2" style={{ marginTop: 8 }}>
                <div>
                  <label>Kirim ke (address tujuan)</label>
                  <input value={tokenRecipient} onChange={(e) => setTokenRecipient(e.target.value)} placeholder="0x..." />
                </div>
                <div>
                  <label>Jumlah {tokenMeta ? `(${tokenMeta.symbol})` : "(token)"}</label>
                  <input value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} placeholder="100" />
                </div>
              </div>
            </>
          )}

          {buildError && <div className="alert error">{buildError}</div>}

          <button
            className="block"
            style={{ marginTop: 12 }}
            disabled={mode === "native" ? !nativeTo || !isAddress(nativeTo) : !tokenMeta}
            onClick={buildQrPayload}
          >
            Buat QR Transaksi
          </button>
        </div>
      )}

      {built && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>2. Minta Tanda Tangan Owner</h3>
          <p className="muted">
            Tiap owner buka <strong>signer.html</strong> lewat dApp browser wallet-nya (HP),
            scan QR ini, review, lalu approve tanda tangan di wallet mereka.
          </p>
          <QRDisplay data={JSON.stringify(built)} />
          <div className="alert info" style={{ marginTop: 12 }}>
            {built.note}<br />
            to: <span className="mono">{built.to}</span><br />
            {built.kind === "native" ? (
              <>value: {formatEther(built.value)} native · </>
            ) : (
              <>token amount (raw calldata): <span className="mono">{built.data.slice(0, 18)}...</span> · </>
            )}
            nonce: {built.nonce}
          </div>
        </div>
      )}

      {built && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>3. Kumpulkan Tanda Tangan ({signatures.length}/{info.threshold})</h3>
          <div className="sig-list">
            {info.owners.map((ownerAddr) => {
              const s = signatures.find((sig) => sig.signer.toLowerCase() === ownerAddr.toLowerCase());
              return (
                <div key={ownerAddr} className="sig-item">
                  <span className="mono">{ownerAddr}</span>
                  {s ? (
                    <span className="badge good">✓ signed</span>
                  ) : (
                    <span className="badge">menunggu tanda tangan</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid cols-2" style={{ marginTop: 16, gap: 16 }}>
            <div className="card" style={{ margin: 0, background: "var(--panel-2, #1a2030)" }}>
              <strong style={{ fontSize: 13 }}>Owner satu lokasi (tercepat)</strong>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Klik tombol di bawah — MetaMask akan munculkan popup pilih akun,
                pilih address owner yang mau tanda tangan (bukan sekadar switch di
                extension, harus lewat popup ini supaya situs baca akun yang benar).
                Tidak perlu kamera / QR sama sekali.
              </p>
              <p className="muted" style={{ fontSize: 11 }}>
                Akun aktif di wallet extension sekarang: <span className="mono">{short(account)}</span>
                {info.owners.some((o) => o.toLowerCase() === account?.toLowerCase())
                  ? <span className="badge good" style={{ marginLeft: 6 }}>owner ✓</span>
                  : <span className="badge" style={{ marginLeft: 6 }}>bukan owner wallet ini</span>}
              </p>
              {directError && <div className="alert error">{directError}</div>}
              <button className="block" style={{ marginTop: 8 }} disabled={directSigning} onClick={signHere}>
                {directSigning ? "Menunggu tanda tangan..." : "Tanda Tangan Langsung di Sini"}
              </button>
            </div>

            <div className="card" style={{ margin: 0, background: "var(--panel-2, #1a2030)" }}>
              <strong style={{ fontSize: 13 }}>Owner remote (via QR)</strong>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Untuk owner yang tidak berada di sini: mereka scan QR transaksi di
                atas lewat <strong>signer.html</strong> di HP mereka, lalu QR hasil tanda
                tangannya di-scan balik lewat kamera di sini.
              </p>
              {scanError && <div className="alert error">{scanError}</div>}
              {!scanning ? (
                <button className="block secondary" style={{ marginTop: 8 }} onClick={() => setScanning(true)}>
                  Scan QR Signature dari Owner
                </button>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <QRScanner onResult={handleScanResult} onClose={() => setScanning(false)} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {built && signatures.length >= info.threshold && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>4. Eksekusi</h3>
          {execError && <div className="alert error">{execError}</div>}
          {execTxHash && <div className="alert success">Terkirim! Tx: <span className="mono">{execTxHash}</span></div>}
          <button className="block" disabled={executing} onClick={handleExecute}>
            {executing ? "Mengeksekusi..." : `Execute Transaction (${signatures.length} tanda tangan)`}
          </button>
        </div>
      )}
    </div>
  );
}
