import { useState } from "react";
import { ContractFactory, isAddress } from "ethers";
import { useNavigate } from "react-router-dom";
import { useWallet } from "../lib/WalletContext";
import { useSelectedWallet } from "../lib/SelectedWalletContext";
import { MULTISIG_ABI, MULTISIG_BYTECODE } from "../lib/multisig";
import { saveWallet } from "../lib/store";

const THRESHOLD = 3;
const OWNER_COUNT = 5;

export default function CreateMultiSig() {
  const { account, provider, chainId, connect } = useWallet();
  const { refreshWallets, setSelected } = useSelectedWallet();
  const navigate = useNavigate();
  const [owners, setOwners] = useState(Array(OWNER_COUNT).fill(""));
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [deployedAddress, setDeployedAddress] = useState(null);

  function setOwner(i, value) {
    const next = [...owners];
    next[i] = value.trim();
    setOwners(next);
  }

  function useMyWallet(i) {
    if (account) setOwner(i, account);
  }

  const trimmed = owners.map((o) => o.trim());
  const allFilled = trimmed.every((o) => o.length > 0);
  const allValid = trimmed.every((o) => isAddress(o));
  const noDuplicates = new Set(trimmed.map((o) => o.toLowerCase())).size === trimmed.length;
  const canDeploy = account && allFilled && allValid && noDuplicates && !deploying;

  async function handleDeploy() {
    setError(null);
    setTxHash(null);
    setDeployedAddress(null);
    if (!provider) return;
    setDeploying(true);
    try {
      const signer = await provider.getSigner();
      const factory = new ContractFactory(MULTISIG_ABI, MULTISIG_BYTECODE, signer);
      const contract = await factory.deploy(trimmed, THRESHOLD);
      setTxHash(contract.deploymentTransaction()?.hash || null);
      await contract.waitForDeployment();
      const address = await contract.getAddress();
      setDeployedAddress(address);
      const entry = { address, chainId, owners: trimmed, threshold: THRESHOLD };
      saveWallet(entry);
      refreshWallets();
      setSelected({ ...entry, createdAt: Date.now() });
    } catch (e) {
      setError(e.shortMessage || e.reason || e.message || "Deploy gagal");
    } finally {
      setDeploying(false);
    }
  }

  if (!account) {
    return (
      <div className="card">
        <h2>Menu Multi Sign</h2>
        <p className="muted">Connect Wallet A dulu untuk deploy multisig wallet.</p>
        <button onClick={connect}>Connect Wallet A</button>
      </div>
    );
  }

  if (deployedAddress) {
    return (
      <div className="card">
        <h2>MultiSig wallet berhasil di-deploy 🎉</h2>
        <p className="mono">{deployedAddress}</p>
        <p className="muted">Threshold {THRESHOLD}-of-{OWNER_COUNT}, chain ID {chainId}</p>
        {txHash && <p className="muted" style={{ fontSize: 12 }}>Tx: {txHash}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button onClick={() => navigate(`/send?wallet=${deployedAddress}&chainId=${chainId}`)}>
            Kirim Dana dari Wallet Ini
          </button>
          <button className="secondary" onClick={() => navigate("/")}>Kembali ke Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Menu Multi Sign — Deploy Wallet Baru</h2>
      <p className="muted">
        Masukkan {OWNER_COUNT} address owner. Threshold tetap {THRESHOLD}-of-{OWNER_COUNT}
        (harus {THRESHOLD} tanda tangan owner untuk eksekusi transaksi). Contract akan
        di-deploy dari Wallet A yang sedang login, di chain ID <strong>{chainId}</strong>.
      </p>

      {owners.map((val, i) => (
        <div key={i} className="owner-input-row">
          <span className="idx">{i + 1}.</span>
          <input
            placeholder="0x..."
            value={val}
            onChange={(e) => setOwner(i, e.target.value)}
          />
          <button className="secondary" onClick={() => useMyWallet(i)} title="Pakai address Wallet A">
            Pakai Wallet A
          </button>
        </div>
      ))}

      {!allValid && allFilled && (
        <div className="alert error">Ada address yang tidak valid — cek format 0x...</div>
      )}
      {!noDuplicates && (
        <div className="alert error">Ada address yang duplikat — 5 owner harus unik.</div>
      )}
      {error && <div className="alert error">{error}</div>}

      <button className="block" style={{ marginTop: 16 }} disabled={!canDeploy} onClick={handleDeploy}>
        {deploying ? "Deploying..." : `Deploy Contract (${THRESHOLD}-of-${OWNER_COUNT})`}
      </button>
      {deploying && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Konfirmasi transaksi deploy di wallet kamu...</p>}
    </div>
  );
}
