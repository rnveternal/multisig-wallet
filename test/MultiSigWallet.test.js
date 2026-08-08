import { expect } from "chai";
import { network } from "hardhat";

// EIP-712 helper: build the domain + type used by the contract and sign
// a transaction with a given ethers Signer.
async function signTx(signer, verifyingContract, chainId, to, value, data, nonce) {
  const domain = {
    name: "MultiSigWallet",
    version: "1",
    chainId,
    verifyingContract,
  };
  const types = {
    Transaction: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "nonce", type: "uint256" },
    ],
  };
  const value_ = { to, value, data, nonce };
  const signature = await signer.signTypedData(domain, types, value_);
  return signature;
}

// Signatures must be submitted sorted by signer address ascending.
function sortSignaturesByAddress(entries) {
  return entries
    .sort((a, b) => (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : 1))
    .map((e) => e.signature.slice(2)) // strip 0x
    .join("");
}

describe("MultiSigWallet (3-of-5)", function () {
  let ethers;
  let wallet;
  let owners; // 5 signer objects
  let threshold = 3;
  let chainId;

  beforeEach(async function () {
    const connection = await network.connect();
    ethers = connection.ethers;

    const signers = await ethers.getSigners();
    owners = signers.slice(0, 5);
    const ownerAddresses = owners.map((o) => o.address);

    wallet = await ethers.deployContract("MultiSigWallet", [ownerAddresses, threshold]);
    chainId = (await ethers.provider.getNetwork()).chainId;

    // fund the wallet
    await owners[0].sendTransaction({
      to: await wallet.getAddress(),
      value: ethers.parseEther("10"),
    });
  });

  it("deploys with correct owners and threshold", async function () {
    expect(await wallet.threshold()).to.equal(3n);
    expect(await wallet.ownerCount()).to.equal(5n);
  });

  it("executes a transaction with exactly 3 valid signatures", async function () {
    const walletAddress = await wallet.getAddress();
    const recipient = owners[4].address; // send back to owner 5, arbitrary
    const value = ethers.parseEther("1");
    const data = "0x";
    const nonce = await wallet.nonce();

    const signEntries = [];
    for (const signer of [owners[0], owners[1], owners[2]]) {
      const sig = await signTx(signer, walletAddress, chainId, recipient, value, data, nonce);
      signEntries.push({ address: signer.address, signature: sig });
    }

    const packedSignatures = "0x" + sortSignaturesByAddress(signEntries);

    const balanceBefore = await ethers.provider.getBalance(recipient);
    await wallet.executeTransaction(recipient, value, data, packedSignatures);
    const balanceAfter = await ethers.provider.getBalance(recipient);

    expect(balanceAfter - balanceBefore).to.equal(value);
    expect(await wallet.nonce()).to.equal(nonce + 1n);
  });

  it("rejects execution with only 2 signatures (below threshold)", async function () {
    const walletAddress = await wallet.getAddress();
    const recipient = owners[4].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const nonce = await wallet.nonce();

    const signEntries = [];
    for (const signer of [owners[0], owners[1]]) {
      const sig = await signTx(signer, walletAddress, chainId, recipient, value, data, nonce);
      signEntries.push({ address: signer.address, signature: sig });
    }
    const packedSignatures = "0x" + sortSignaturesByAddress(signEntries);

    await expect(
      wallet.executeTransaction(recipient, value, data, packedSignatures)
    ).to.be.revertedWith("MultiSig: not enough signatures");
  });

  it("rejects a signature from a non-owner", async function () {
    const walletAddress = await wallet.getAddress();
    const allSigners = await ethers.getSigners();
    const outsider = allSigners[6]; // not in the owners array
    const recipient = owners[4].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const nonce = await wallet.nonce();

    const signEntries = [];
    for (const signer of [owners[0], owners[1], outsider]) {
      const sig = await signTx(signer, walletAddress, chainId, recipient, value, data, nonce);
      signEntries.push({ address: signer.address, signature: sig });
    }
    const packedSignatures = "0x" + sortSignaturesByAddress(signEntries);

    await expect(
      wallet.executeTransaction(recipient, value, data, packedSignatures)
    ).to.be.reverted;
  });

  it("rejects replay of an already-executed transaction (nonce advanced)", async function () {
    const walletAddress = await wallet.getAddress();
    const recipient = owners[4].address;
    const value = ethers.parseEther("1");
    const data = "0x";
    const nonce = await wallet.nonce();

    const signEntries = [];
    for (const signer of [owners[0], owners[1], owners[2]]) {
      const sig = await signTx(signer, walletAddress, chainId, recipient, value, data, nonce);
      signEntries.push({ address: signer.address, signature: sig });
    }
    const packedSignatures = "0x" + sortSignaturesByAddress(signEntries);

    await wallet.executeTransaction(recipient, value, data, packedSignatures);

    // Replaying the exact same signatures should fail: the digest was
    // computed against the OLD nonce, which no longer matches wallet.nonce().
    await expect(
      wallet.executeTransaction(recipient, value, data, packedSignatures)
    ).to.be.reverted;
  });

  it("rotates owners and threshold via self-governed setOwners", async function () {
    const walletAddress = await wallet.getAddress();
    const allSigners = await ethers.getSigners();
    const newOwner = allSigners[6];

    const newOwners = [owners[0].address, owners[1].address, owners[2].address, owners[3].address, newOwner.address];
    const newThreshold = 4;

    const iface = new ethers.Interface([
      "function setOwners(address[] newOwners, uint256 newThreshold)",
    ]);
    const data = iface.encodeFunctionData("setOwners", [newOwners, newThreshold]);
    const nonce = await wallet.nonce();

    const signEntries = [];
    for (const signer of [owners[0], owners[1], owners[2]]) {
      const sig = await signTx(signer, walletAddress, chainId, walletAddress, 0n, data, nonce);
      signEntries.push({ address: signer.address, signature: sig });
    }
    const packedSignatures = "0x" + sortSignaturesByAddress(signEntries);

    await wallet.executeTransaction(walletAddress, 0n, data, packedSignatures);

    expect(await wallet.threshold()).to.equal(4n);
    expect(await wallet.isOwner(newOwner.address)).to.equal(true);
    expect(await wallet.isOwner(owners[4].address)).to.equal(false);
  });
});
