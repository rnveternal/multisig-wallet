import { Interface } from "ethers";
import artifact from "./MultiSigWallet.artifact.json";

export const MULTISIG_ABI = artifact.abi;
export const MULTISIG_BYTECODE = artifact.bytecode;

// Minimal ERC20 surface needed to read metadata and build a transfer() call.
export const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

const erc20Iface = new Interface(ERC20_ABI);

// Encodes calldata for token.transfer(recipient, amountInSmallestUnit).
export function encodeErc20Transfer(recipient, amountRaw) {
  return erc20Iface.encodeFunctionData("transfer", [recipient, amountRaw]);
}

// Must mirror contracts/MultiSigWallet.sol exactly, or signatures won't
// recover to the right signer on-chain.
export function eip712Domain(chainId, verifyingContract) {
  return {
    name: "MultiSigWallet",
    version: "1",
    chainId: Number(chainId),
    verifyingContract,
  };
}

export const EIP712_TYPES = {
  Transaction: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "nonce", type: "uint256" },
  ],
};

// Packs collected {signer, signature} entries into the concatenated,
// address-sorted-ascending byte string executeTransaction() expects.
export function packSignatures(entries) {
  const sorted = [...entries].sort((a, b) =>
    a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1
  );
  return "0x" + sorted.map((e) => e.signature.replace(/^0x/, "")).join("");
}
