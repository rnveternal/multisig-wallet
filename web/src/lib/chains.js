// EVM chains shown on the multi-chain portfolio dashboard.
// rpc uses public endpoints by default — override any of them via
// VITE_RPC_<CHAINID> in web/.env if you have your own RPC (recommended
// for reliability, since public endpoints can rate-limit).
export const CHAINS = [
  {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    color: "#627eea",
    geckoId: "ethereum",
    rpc: import.meta.env.VITE_RPC_1 || "https://eth.llamarpc.com",
  },
  {
    id: 56,
    name: "BNB Chain",
    symbol: "BNB",
    color: "#f0b90b",
    geckoId: "binancecoin",
    rpc: import.meta.env.VITE_RPC_56 || "https://bsc-dataseed.binance.org",
  },
  {
    id: 137,
    name: "Polygon",
    symbol: "POL",
    color: "#8247e5",
    geckoId: "matic-network",
    rpc: import.meta.env.VITE_RPC_137 || "https://polygon-rpc.com",
  },
  {
    id: 42161,
    name: "Arbitrum One",
    symbol: "ETH",
    color: "#28a0f0",
    geckoId: "ethereum",
    rpc: import.meta.env.VITE_RPC_42161 || "https://arb1.arbitrum.io/rpc",
  },
  {
    id: 10,
    name: "Optimism",
    symbol: "ETH",
    color: "#ff0420",
    geckoId: "ethereum",
    rpc: import.meta.env.VITE_RPC_10 || "https://mainnet.optimism.io",
  },
  {
    id: 8453,
    name: "Base",
    symbol: "ETH",
    color: "#0052ff",
    geckoId: "ethereum",
    rpc: import.meta.env.VITE_RPC_8453 || "https://mainnet.base.org",
  },
];

export function chainById(id) {
  return CHAINS.find((c) => c.id === Number(id));
}
