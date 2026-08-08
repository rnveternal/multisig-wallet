<div align="center">

# MultiSigWallet

### Your own M-of-N EVM multisig — deployed, held, and run entirely by you.

No Gnosis Safe. No relayer. No hosted dashboard. No third party, anywhere in the stack.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.24-363636?logo=solidity)](./contracts/MultiSigWallet.sol)
[![Self-Custodial](https://img.shields.io/badge/Custody-100%25%20Self--Sovereign-brightgreen)]()

**Crafted by [RNVETERNAL](#)**

</div>

---



I got tired of "self-custody" multisig tools that still made me trust
somebody else's server, somebody else's frontend, somebody else's uptime.
A wallet that needs a company to stay online isn't really *yours* — it's
rented.

So I built the version I actually wanted: a contract I deploy myself, a
CLI I can read top to bottom, and a local web UI that never talks to a
backend I don't control. No account to create, no service that can be
shut down, no middleman who can freeze anything. If GitHub disappeared
tomorrow, the wallet would keep working exactly the same, because nothing
about it depends on anyone but the owners who signed.

It doesn't need to secure a fortune to be worth building. The point was
proving that self-custody at the multisig level can still be simple,
readable, and owned by no one but the people holding the keys.

> If you're securing serious funds, get a professional audit first.
> If you're securing your own stack and want to understand — and
> control — every line that touches it, this is for you.

---

## Table of contents

- [How it works](#how-it-works)
- [Setup](#setup)
- [Compile & test](#compile--test)
- [Deploy](#deploy)
- [Usage — CLI](#usage--cli)
- [Usage — Web coordinator app](#usage--web-coordinator-app)
- [Security](#security)
- [License](#license)

---

## How it works

| | |
|---|---|
| 📄 **Single-file contract** | `contracts/MultiSigWallet.sol` — M-of-N threshold, default 3-of-5 |
| ✍️ **Off-chain signing** | Owners sign via EIP-712 typed data — zero gas to sign |
| 🌍 **Permissionless relay** | Anyone — owner or not — can collect signatures and submit once threshold is met |
| 🔁 **Self-governance** | Owner rotation & threshold changes (`setOwners`) go through the *same* M-of-N flow — no external admin key, ever |
| ⛽ **Gas-optimized** | Bounded loops run `unchecked`, storage reads cached — cheaper execution, same guarantees |

---

## Setup

```bash
npm install
cp .env.example .env
# fill in RPC_URL, WALLET_ADDRESS (after deploy), SIGNER_PRIVATE_KEY
```

## Compile & test

Run on your own machine (needs normal internet access the first time, to
fetch the Solidity compiler):

```bash
npx hardhat compile
npx hardhat test
```

The suite (`test/MultiSigWallet.test.js`) covers: deployment, a valid
3-signature execution, rejection below threshold, rejection of a
non-owner signer, replay rejection, and owner rotation via
self-governance.

## Deploy

Edit `ignition/modules/MultiSigWallet.js` with your real owner addresses,
then:

```bash
npx hardhat ignition deploy ignition/modules/MultiSigWallet.js --network <network-name>
```

Save the deployed address into `.env` as `WALLET_ADDRESS`.

---

## Usage — CLI

**1. Check wallet status**
```bash
node cli/multisig-cli.js info
```
Shows the current owners, threshold, and nonce straight from the contract.

**2. Each consenting owner signs — off-chain, no gas required**
```bash
node cli/multisig-cli.js sign --to 0xRecipient --value 1000000000000000000 --data 0x
```
Outputs a JSON signature — send it to whoever is coordinating, over
whatever channel you trust (Signal, email, anything).

**3. Once ≥ threshold signatures are collected, merge them**
```json
// sigs.json
[
  { "signer": "0xOwner1...", "signature": "0x..." },
  { "signer": "0xOwner2...", "signature": "0x..." },
  { "signer": "0xOwner3...", "signature": "0x..." }
]
```

**4. Submit & execute — with a gas safety net built in**
```bash
node cli/multisig-cli.js execute --to 0xRecipient --value 1000000000000000000 --data 0x --sigs sigs.json
```

Before anything is broadcast, `execute` automatically:

1. **Simulates the call first** — a bad signature, stale nonce, or unmet
   threshold is caught with the real revert reason, before any gas is spent.
2. **Estimates gas + adds a 20% safety buffer** — override with `--gas-limit N`.
3. **Reads live EIP-1559 fee data** and previews worst-case cost — override
   with `--max-fee GWEI` / `--max-priority-fee GWEI`.
4. **Asks for confirmation** before sending — skip with `--yes` for scripting.

```bash
# manual overrides, no confirmation prompt
node cli/multisig-cli.js execute --to 0x... --sigs sigs.json --max-fee 25 --gas-limit 120000 --yes
```

The account running `execute` only needs enough native token for gas —
it does **not** need to be an owner.

---

## Usage — Web coordinator app

Prefer a UI over the CLI? `web/` is a local-only web app — no backend, no
third-party relay — that covers the same flow visually.

```bash
# Windows
web.bat

# macOS/Linux
./web.sh
```

This installs dependencies on first run and opens the app automatically
at `http://localhost:5173` (or similar).

**Flow:**

1. **Connect** — click *Connect Wallet A* to link your browser wallet
   (MetaMask or any injected wallet).
2. **Dashboard** — pick a deployed multisig from the wallet switcher to see
   its live on-chain balance, owners, and threshold.
3. **Multi Sign → Deploy** — enter 5 owner addresses and deploy a fresh
   3-of-5 contract straight from your connected wallet.
4. **Kirim Dana (Send Funds)** — build a transaction (native token or
   ERC-20), then collect signatures either:
   - **Directly in this browser**, if an owner is physically at the same
     computer — switch accounts via the wallet's permission popup and sign
     with no camera involved, or
   - **Via QR**, for a remote owner — they open `signer.html` on their
     phone's wallet dApp browser, scan the transaction QR, sign, and the
     resulting signature QR is scanned back in.
5. Once enough signatures are collected, hit **Execute** to broadcast.

See [`web/README.md`](web/README.md) for more detail on the QR signing flow.

---

## Security

- 🔑 `SIGNER_PRIVATE_KEY` in `.env` must be guarded closely — never commit it.
- 🗄️ Store each owner's key on a separate device/hardware wallet — never
  all on one server.
- 🔍 Always verify the `nonce` and transaction contents (to/value/data)
  before signing. EIP-712 binds the nonce so replay is impossible — but
  the destination is still on you to check.
- ✅ Compiles clean with `solc`. **Still get it reviewed before deploying
  with meaningful funds** — this is a solid skeleton, not a
  third-party-audited contract.

---

## License

MIT — see [LICENSE](./LICENSE).

<div align="center">
<sub>Built self-contained, released open, owned by nobody.</sub><br/>
<sub><b>— RNVETERNAL</b></sub>
</div>
