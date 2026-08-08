import { useState } from "react";
import { useWallet } from "../lib/WalletContext";
import { useSelectedWallet } from "../lib/SelectedWalletContext";
import { chainById } from "../lib/chains";
import { short } from "../lib/format";

export default function Topbar() {
  const { account, connect, connecting, disconnect } = useWallet();
  const { wallets, selected, setSelected } = useSelectedWallet();
  const [open, setOpen] = useState(false);

  const chain = selected ? chainById(selected.chainId) : null;

  return (
    <div className="topbar">
      <div>
        <div className="topbar-greeting">Hi, {account ? short(account) : "Guest"}</div>
        <div className="muted" style={{ fontSize: 13 }}>Kelola wallet multisig kamu dengan aman dan transparan.</div>
      </div>

      <div className="topbar-controls">
        {chain && (
          <span className="pill">
            <span className="chain-dot" style={{ background: chain.color }} />
            {chain.name}
          </span>
        )}

        <div className="wallet-switcher">
          <button
            className="secondary pill-button"
            onClick={() => setOpen((o) => !o)}
            disabled={wallets.length === 0}
          >
            {selected ? short(selected.address) : "Belum ada wallet"}
            <span style={{ marginLeft: 6 }}>▾</span>
          </button>
          {open && wallets.length > 0 && (
            <div className="wallet-switcher-menu" onMouseLeave={() => setOpen(false)}>
              {wallets.map((w) => {
                const c = chainById(w.chainId);
                const isActive = selected && selected.address === w.address && selected.chainId === w.chainId;
                return (
                  <button
                    key={`${w.address}-${w.chainId}`}
                    className={"wallet-switcher-item" + (isActive ? " active" : "")}
                    onClick={() => {
                      setSelected(w);
                      setOpen(false);
                    }}
                  >
                    <span className="mono">{short(w.address)}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{c?.name || `Chain ${w.chainId}`}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {account ? (
          <button className="secondary" onClick={disconnect}>Disconnect</button>
        ) : (
          <button onClick={connect} disabled={connecting}>
            {connecting ? "Connecting..." : "Connect Wallet A"}
          </button>
        )}
      </div>
    </div>
  );
}
