import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { listWallets } from "./store";

const KEY = "multisig-selected-wallet";
const Ctx = createContext(null);

export function SelectedWalletProvider({ children }) {
  const [wallets, setWallets] = useState(() => listWallets());
  const [selected, setSelectedState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      const all = listWallets();
      if (saved && all.some((w) => w.address === saved.address && w.chainId === saved.chainId)) {
        return saved;
      }
      return all[0] || null;
    } catch {
      return null;
    }
  });

  const refreshWallets = useCallback(() => {
    const all = listWallets();
    setWallets(all);
    // If the previously selected wallet got removed, or nothing was
    // selected yet, fall back to the most recent one.
    setSelectedState((prev) => {
      if (prev && all.some((w) => w.address === prev.address && w.chainId === prev.chainId)) {
        return prev;
      }
      return all[0] || null;
    });
  }, []);

  const setSelected = useCallback((wallet) => {
    setSelectedState(wallet);
    localStorage.setItem(KEY, JSON.stringify(wallet));
  }, []);

  useEffect(() => {
    refreshWallets();
  }, [refreshWallets]);

  return (
    <Ctx.Provider value={{ wallets, selected, setSelected, refreshWallets }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSelectedWallet() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSelectedWallet must be used inside <SelectedWalletProvider>");
  return ctx;
}
