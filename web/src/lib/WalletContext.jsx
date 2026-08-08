import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { BrowserProvider } from "ethers";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const hasInjected = typeof window !== "undefined" && !!window.ethereum;

  const refresh = useCallback(async () => {
    if (!window.ethereum) return;
    const p = new BrowserProvider(window.ethereum);
    setProvider(p);
    const accounts = await p.send("eth_accounts", []);
    if (accounts[0]) {
      setAccount(accounts[0]);
      const network = await p.getNetwork();
      setChainId(Number(network.chainId));
    } else {
      setAccount(null);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("Wallet browser tidak terdeteksi. Buka lewat MetaMask / Trust Wallet dApp browser.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const p = new BrowserProvider(window.ethereum);
      const accounts = await p.send("eth_requestAccounts", []);
      setProvider(p);
      setAccount(accounts[0]);
      const network = await p.getNetwork();
      setChainId(Number(network.chainId));
    } catch (e) {
      setError(e.shortMessage || e.message || "Gagal connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
  }, []);

  useEffect(() => {
    refresh();
    if (!window.ethereum) return;
    const onAccounts = (accs) => setAccount(accs[0] || null);
    const onChain = () => refresh();
    window.ethereum.on?.("accountsChanged", onAccounts);
    window.ethereum.on?.("chainChanged", onChain);
    return () => {
      window.ethereum.removeListener?.("accountsChanged", onAccounts);
      window.ethereum.removeListener?.("chainChanged", onChain);
    };
  }, [refresh]);

  return (
    <WalletContext.Provider
      value={{ account, chainId, provider, connecting, error, hasInjected, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
