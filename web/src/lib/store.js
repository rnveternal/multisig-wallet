// Everything here is stored only in the browser's localStorage — there is
// no backend/server. This is just so the coordinator doesn't have to
// re-paste the multisig address & chain every time they reopen the app.
const KEY = "multisig-wallets";

export function listWallets() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveWallet(entry) {
  const wallets = listWallets().filter(
    (w) => !(w.address === entry.address && w.chainId === entry.chainId)
  );
  wallets.unshift({ createdAt: Date.now(), ...entry });
  localStorage.setItem(KEY, JSON.stringify(wallets));
}

export function getWallet(address, chainId) {
  if (!address) return null;
  return (
    listWallets().find(
      (w) => w.address.toLowerCase() === address.toLowerCase() && Number(w.chainId) === Number(chainId)
    ) || null
  );
}

export function removeWallet(address, chainId) {
  const wallets = listWallets().filter(
    (w) => !(w.address === address && w.chainId === chainId)
  );
  localStorage.setItem(KEY, JSON.stringify(wallets));
}
