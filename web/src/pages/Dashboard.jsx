import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { JsonRpcProvider, formatEther, Contract } from "ethers";
import { useSelectedWallet } from "../lib/SelectedWalletContext";
import { chainById } from "../lib/chains";
import { fetchPriceChart, fetchSimplePrice } from "../lib/price";
import { short, formatDate, formatAmount, formatUsd } from "../lib/format";
import { MULTISIG_ABI } from "../lib/multisig";

const RANGES = [
  { key: "1", label: "1D" },
  { key: "7", label: "7D" },
  { key: "30", label: "30D" },
];

function Sparkline({ points, positive }) {
  if (!points || points.length < 2) {
    return <div className="muted" style={{ fontSize: 12 }}>Grafik harga belum tersedia.</div>;
  }
  const values = points.map((p) => p[1]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 600, h = 140, pad = 6;
  const path = points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p[1] - min) / span) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${path} L${w - pad},${h - pad} L${pad},${h - pad} Z`;
  const stroke = positive ? "var(--good)" : "var(--accent)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="140" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkFill)" stroke="none" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

export default function Dashboard() {
  const { wallets, selected } = useSelectedWallet();
  const navigate = useNavigate();
  const chain = selected ? chainById(selected.chainId) : null;

  const [balance, setBalance] = useState(null); // { ok, value }
  const [loadingBalance, setLoadingBalance] = useState(false);

  const [range, setRange] = useState("7");
  const [chartPoints, setChartPoints] = useState(null);
  const [priceUsd, setPriceUsd] = useState(null);
  const [change24h, setChange24h] = useState(null);
  const [priceError, setPriceError] = useState(null);

  const contract = useMemo(() => {
    if (!selected || !chain) return null;
    // Read-only lookups only need a provider, not a signer, so a plain
    // JsonRpcProvider for the wallet's own chain is enough here.
    const provider = new JsonRpcProvider(chain.rpc, chain.id);
    return new Contract(selected.address, MULTISIG_ABI, provider);
  }, [selected, chain]);

  const [ownersLive, setOwnersLive] = useState(null);
  const [thresholdLive, setThresholdLive] = useState(null);

  // Native balance of the CONTRACT itself (not the connected EOA).
  useEffect(() => {
    if (!selected || !chain) return;
    let cancelled = false;
    setLoadingBalance(true);
    setBalance(null);
    (async () => {
      try {
        const provider = new JsonRpcProvider(chain.rpc, chain.id);
        const bal = await provider.getBalance(selected.address);
        if (!cancelled) setBalance({ ok: true, value: formatEther(bal) });
      } catch {
        if (!cancelled) setBalance({ ok: false });
      } finally {
        if (!cancelled) setLoadingBalance(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected, chain]);

  // Owners/threshold read live from chain, so this stays correct even if
  // it was changed after the wallet was first saved locally.
  useEffect(() => {
    if (!contract) return;
    let cancelled = false;
    (async () => {
      try {
        const [owners, threshold] = await Promise.all([contract.getOwners(), contract.threshold()]);
        if (!cancelled) {
          setOwnersLive(owners);
          setThresholdLive(Number(threshold));
        }
      } catch {
        if (!cancelled) {
          setOwnersLive(selected?.owners || null);
          setThresholdLive(selected?.threshold ?? null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [contract, selected]);

  // Price chart + current USD price, from CoinGecko's free public API.
  useEffect(() => {
    if (!chain?.geckoId) return;
    let cancelled = false;
    setPriceError(null);
    setChartPoints(null);
    (async () => {
      try {
        const [chart, simple] = await Promise.all([
          fetchPriceChart(chain.geckoId, range),
          fetchSimplePrice([chain.geckoId]),
        ]);
        if (cancelled) return;
        setChartPoints(chart);
        const p = simple[chain.geckoId];
        setPriceUsd(p?.usd ?? null);
        setChange24h(p?.usd_24h_change ?? null);
      } catch (e) {
        if (!cancelled) setPriceError("Gagal ambil harga — CoinGecko mungkin lagi rate-limit, coba lagi sebentar.");
      }
    })();
    return () => { cancelled = true; };
  }, [chain, range]);

  if (wallets.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: "48px 24px" }}>
        <h2 style={{ marginTop: 0 }}>Belum ada multisig wallet</h2>
        <p className="muted">Deploy wallet multisig pertama kamu untuk mulai kelola dana bareng-bareng.</p>
        <Link to="/create"><button style={{ marginTop: 8 }}>+ Deploy Multisig Pertama</button></Link>
      </div>
    );
  }

  if (!selected) return null;

  const owners = ownersLive || selected.owners || [];
  const threshold = thresholdLive ?? selected.threshold ?? "?";
  const usdValue = balance?.ok && priceUsd != null ? Number(balance.value) * priceUsd : null;

  return (
    <>
      <div className="grid cols-3" style={{ alignItems: "stretch" }}>
        <div className="card" style={{ gridColumn: "span 2", margin: 0 }}>
          <div className="row between">
            <div>
              <h3 style={{ margin: 0 }}>Wallet Overview</h3>
              <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>Ringkasan saldo native token wallet ini.</p>
            </div>
            <div className="range-toggle">
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  className={"range-btn" + (range === r.key ? " active" : "")}
                  onClick={() => setRange(r.key)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 12 }}>Saldo Contract</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {loadingBalance || !balance ? "..." : balance.ok ? `${formatAmount(balance.value)} ${chain?.symbol}` : "Gagal memuat"}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {usdValue != null ? `≈ ${formatUsd(usdValue)}` : priceError ? priceError : "menghitung nilai USD..."}
              {change24h != null && (
                <span style={{ marginLeft: 8, color: change24h >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {change24h >= 0 ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}% (24h {chain?.symbol})
                </span>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14 }}>
            <Sparkline points={chartPoints} positive={(change24h ?? 0) >= 0} />
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Grafik menampilkan tren harga {chain?.symbol} ({RANGES.find((r) => r.key === range)?.label}), bukan riwayat saldo wallet — riwayat saldo per-waktu butuh indexer terpisah yang belum dipasang.
          </p>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ margin: 0 }}>Wallet Info</h3>
          <div className="info-row"><span className="muted">Address</span><span className="mono">{short(selected.address)}</span></div>
          <div className="info-row"><span className="muted">Network</span><span>{chain?.name || `Chain ${selected.chainId}`}</span></div>
          <div className="info-row"><span className="muted">Contract Type</span><span>Multi Sign Wallet</span></div>
          <div className="info-row"><span className="muted">Threshold</span><span>{threshold} of {owners.length}</span></div>
          <div className="info-row"><span className="muted">Dibuat</span><span>{formatDate(selected.createdAt)}</span></div>
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 18 }}>
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ margin: 0 }}>Aset di Wallet</h3>
          <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>Saldo native token di dalam contract ini.</p>
          <div className="sig-list" style={{ marginTop: 10 }}>
            <div className="sig-item">
              <div className="row">
                <span className="chain-dot" style={{ background: chain?.color }} />
                <div>
                  <div>{chain?.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{chain?.symbol}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div>{balance?.ok ? `${formatAmount(balance.value)} ${chain?.symbol}` : "—"}</div>
                <div className="muted" style={{ fontSize: 11 }}>{usdValue != null ? formatUsd(usdValue) : ""}</div>
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
            Deteksi token ERC20 (USDT, USDC, dll) otomatis belum aktif di versi ini.
          </p>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <div className="row between">
            <h3 style={{ margin: 0 }}>Pemilik Wallet ({owners.length})</h3>
          </div>
          <div className="sig-list" style={{ marginTop: 10 }}>
            {owners.map((o, i) => (
              <div key={o} className="sig-item">
                <div>
                  <div style={{ fontSize: 13 }}>Owner {i + 1}</div>
                  <div className="muted mono" style={{ fontSize: 11 }}>{short(o)}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="block" style={{ marginTop: 12 }} onClick={() => navigate(`/send?wallet=${selected.address}&chainId=${selected.chainId}`)}>
            Kirim Dana
          </button>
        </div>
      </div>
    </>
  );
}
