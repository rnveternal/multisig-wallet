#!/usr/bin/env node
/**
 * multisig-cli.js
 *
 * Standalone operational CLI for MultiSigWallet.sol. No dependency on any
 * third-party multisig service — talks directly to your own deployed
 * contract via any RPC endpoint you configure.
 *
 * Usage:
 *   node cli/multisig-cli.js info
 *   node cli/multisig-cli.js sign --to 0x... --value 0 --data 0x... [--nonce N]
 *   node cli/multisig-cli.js execute --to 0x... --value 0 --data 0x... --sigs sigs.json
 *     [--gas-limit N] [--max-fee GWEI] [--max-priority-fee GWEI] [--yes]
 *
 * Config via .env (see .env.example):
 *   RPC_URL=https://your-rpc-endpoint
 *   WALLET_ADDRESS=0xYourDeployedMultiSigAddress
 *   SIGNER_PRIVATE_KEY=0x...          (only needed for `sign` and `execute`)
 *
 * `execute` gas handling:
 *   1. Simulates the call first (staticCall) so a bad signature/threshold/
 *      revert is caught BEFORE any gas is spent, with the actual revert
 *      reason decoded.
 *   2. Estimates gas from the node, then adds a safety buffer (default 20%)
 *      so the tx doesn't fail on-chain from a slightly-off estimate.
 *   3. Reads current network fee data (EIP-1559) and shows the worst-case
 *      cost in native currency before asking for confirmation.
 *   4. --gas-limit / --max-fee / --max-priority-fee let you override any of
 *      these manually (values in gwei for the fee flags). --yes skips the
 *      confirmation prompt (useful for scripting/CI).
 */

import "dotenv/config";
import { ethers } from "ethers";
import fs from "node:fs";
import readline from "node:readline";

const GAS_BUFFER_BPS = 2000n; // +20% safety margin on the node's gas estimate

const ABI = [
  "function threshold() view returns (uint256)",
  "function nonce() view returns (uint256)",
  "function getOwners() view returns (address[])",
  "function ownerCount() view returns (uint256)",
  "function getTransactionHash(address to, uint256 value, bytes data, uint256 nonce) view returns (bytes32)",
  "function executeTransaction(address to, uint256 value, bytes data, bytes signatures) returns (bytes)",
];

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} in .env — copy .env.example to .env and fill it in.`);
    process.exit(1);
  }
  return v;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
      args[key] = val;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

async function getProviderAndWallet() {
  const rpcUrl = requireEnv("RPC_URL");
  const walletAddress = requireEnv("WALLET_ADDRESS");
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(walletAddress, ABI, provider);
  return { provider, contract, walletAddress };
}

async function cmdInfo() {
  const { contract, provider, walletAddress } = await getProviderAndWallet();
  const [threshold, nonce, owners, network] = await Promise.all([
    contract.threshold(),
    contract.nonce(),
    contract.getOwners(),
    provider.getNetwork(),
  ]);
  const balance = await provider.getBalance(walletAddress);

  console.log("Wallet:", walletAddress);
  console.log("Chain ID:", network.chainId.toString());
  console.log("Threshold:", threshold.toString(), "of", owners.length);
  console.log("Owners:");
  owners.forEach((o) => console.log("  -", o));
  console.log("Current nonce:", nonce.toString());
  console.log("Balance:", ethers.formatEther(balance), "ETH");
}

async function cmdSign(args) {
  const { to, value = "0", data = "0x" } = args;
  if (!to) {
    console.error("Usage: sign --to 0x... [--value 0] [--data 0x...] [--nonce N]");
    process.exit(1);
  }

  const rpcUrl = requireEnv("RPC_URL");
  const walletAddress = requireEnv("WALLET_ADDRESS");
  const privateKey = requireEnv("SIGNER_PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(walletAddress, ABI, provider);

  const nonce = args.nonce !== undefined ? BigInt(args.nonce) : await contract.nonce();
  const network = await provider.getNetwork();

  const domain = {
    name: "MultiSigWallet",
    version: "1",
    chainId: network.chainId,
    verifyingContract: walletAddress,
  };
  const types = {
    Transaction: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "nonce", type: "uint256" },
    ],
  };
  const txValue = { to, value: BigInt(value), data, nonce };

  const signature = await signer.signTypedData(domain, types, txValue);

  const result = {
    signer: await signer.getAddress(),
    to,
    value: value.toString(),
    data,
    nonce: nonce.toString(),
    signature,
  };

  console.log(JSON.stringify(result, null, 2));
  console.log("\nSend this JSON to whoever is collecting signatures for this transaction.");
}

function gweiToWei(v) {
  return ethers.parseUnits(String(v), "gwei");
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function cmdExecute(args) {
  const { to, value = "0", data = "0x", sigs } = args;
  if (!to || !sigs) {
    console.error(
      "Usage: execute --to 0x... [--value 0] [--data 0x...] --sigs sigs.json " +
        "[--gas-limit N] [--max-fee GWEI] [--max-priority-fee GWEI] [--yes]"
    );
    process.exit(1);
  }

  const rpcUrl = requireEnv("RPC_URL");
  const walletAddress = requireEnv("WALLET_ADDRESS");
  const privateKey = requireEnv("SIGNER_PRIVATE_KEY"); // pays gas; doesn't need to be an owner

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const sender = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(walletAddress, ABI, sender);
  const threshold = await contract.threshold();

  // sigs.json: array of { signer, signature } objects, one per collected signature.
  const collected = JSON.parse(fs.readFileSync(sigs, "utf8"));
  if (!Array.isArray(collected) || collected.length < Number(threshold)) {
    console.error(`Need at least ${threshold} signatures, got ${collected.length}.`);
    process.exit(1);
  }

  // Contract requires signatures sorted by signer address ascending.
  const sorted = [...collected].sort((a, b) =>
    a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1
  );
  const packedSignatures = "0x" + sorted.map((e) => e.signature.slice(2)).join("");
  const txValue = BigInt(value);

  // --- 1. Simulate first: catches bad signatures / stale nonce / threshold
  //     issues with the real revert reason, before spending any gas. ---
  try {
    await contract.executeTransaction.staticCall(to, txValue, data, packedSignatures);
  } catch (err) {
    const reason = err.reason || err.shortMessage || err.message;
    console.error("Simulation failed — transaction would revert on-chain:");
    console.error(" ", reason);
    console.error("\nNo gas was spent. Fix the issue (signatures/nonce/threshold) and retry.");
    process.exit(1);
  }

  // --- 2. Estimate gas, add safety buffer (overridable with --gas-limit). ---
  let gasLimit;
  if (args["gas-limit"]) {
    gasLimit = BigInt(args["gas-limit"]);
  } else {
    const estimated = await contract.executeTransaction.estimateGas(to, txValue, data, packedSignatures);
    gasLimit = (estimated * (10000n + GAS_BUFFER_BPS)) / 10000n;
  }

  // --- 3. Resolve fee params (EIP-1559), overridable with --max-fee /
  //     --max-priority-fee (both in gwei). Falls back to node suggestion. ---
  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = args["max-priority-fee"]
    ? gweiToWei(args["max-priority-fee"])
    : feeData.maxPriorityFeePerGas ?? feeData.gasPrice;
  const maxFeePerGas = args["max-fee"]
    ? gweiToWei(args["max-fee"])
    : feeData.maxFeePerGas ?? feeData.gasPrice;

  const worstCaseCost = gasLimit * maxFeePerGas;
  const network = await provider.getNetwork();
  const symbol = network.chainId === 1n ? "ETH" : "native token";

  console.log("--- Gas preview ---");
  console.log("Gas limit (with buffer):", gasLimit.toString());
  console.log("Max fee per gas:", ethers.formatUnits(maxFeePerGas, "gwei"), "gwei");
  console.log("Max priority fee per gas:", ethers.formatUnits(maxPriorityFeePerGas, "gwei"), "gwei");
  console.log("Worst-case gas cost:", ethers.formatEther(worstCaseCost), symbol);
  console.log("--------------------");

  if (!args.yes) {
    const answer = await confirm(
      `Send this transaction (to=${to}, value=${ethers.formatEther(txValue)} ${symbol}) now? [y/N] `
    );
    if (answer !== "y" && answer !== "yes") {
      console.log("Aborted — nothing was sent.");
      process.exit(0);
    }
  }

  console.log("Submitting transaction with", sorted.length, "signatures...");
  const tx = await contract.executeTransaction(to, txValue, data, packedSignatures, {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
  });
  console.log("Tx sent:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block", receipt.blockNumber, "— actual gas used:", receipt.gasUsed.toString());
}

async function main() {
  const [, , command, ...rest] = process.argv;
  const args = parseArgs(rest);

  switch (command) {
    case "info":
      await cmdInfo();
      break;
    case "sign":
      await cmdSign(args);
      break;
    case "execute":
      await cmdExecute(args);
      break;
    default:
      console.log("Usage: node cli/multisig-cli.js <info|sign|execute> [options]");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
