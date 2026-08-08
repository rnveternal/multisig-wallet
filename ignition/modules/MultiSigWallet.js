import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Edit these before deploying to a real network.
const OWNERS = [
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003",
  "0x0000000000000000000000000000000000000004",
  "0x0000000000000000000000000000000000000005",
];
const THRESHOLD = 3;

export default buildModule("MultiSigWalletModule", (m) => {
  const owners = m.getParameter("owners", OWNERS);
  const threshold = m.getParameter("threshold", THRESHOLD);

  const wallet = m.contract("MultiSigWallet", [owners, threshold]);

  return { wallet };
});
