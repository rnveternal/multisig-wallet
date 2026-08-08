<div align="center">

# MultiSigWallet

### A personal M-of-N EVM multisig you deploy, hold, and run — alone.

No Gnosis Safe. No relayer. No hosted dashboard. No third party, anywhere in the stack.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Solidity](https://img.shields.io/badge/Solidity-%5E0.8.24-363636?logo=solidity)](./contracts/MultiSigWallet.sol)
[![Self-Custodial](https://img.shields.io/badge/Custody-100%25%20Self--Sovereign-brightgreen)]()

**Crafted by [RNVETERNAL](#)**

</div>

---

## Why this exists

Crypto was supposed to mean *you* hold the keys — not a company, not a
frontend, not a "service" that can go down, get hacked, or get shut off.
Somewhere along the way, multisig quietly became synonymous with logging
into someone else's website.

This project is a small push back toward the original idea: a wallet that
needs nothing but math and your own signatures to move funds. One file.
No dependencies. No dashboard to trust.

It doesn't matter if the balance inside is small — that was never the
point. The point is proving that self-custody at the multisig level can
still be **simple**, **transparent**, **auditable by anyone**, and
**owned by no one but you.**

> If you're securing a fortune, get a professional audit first.
> If you're securing your own stack and want to understand — and
> control — every line that touches it, this is for you.

---

## Table of contents

- [How it works](#how-it-works)
- [Setup](#setup)
- [Compile & test](#compile--test)
- [Deploy](#deploy)
- [Daily operations](#daily-operations-cli)
- [Web coordinator app](#web-coordinator-app)
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

## Daily operations (CLI)

**1. Check wallet status**
```bash
node cli/multisig-cli.js info
```

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

## Web coordinator app

Prefer a UI over the CLI? `web/` is a local-only web app (no backend, no
third-party relay) that covers the same flow visually: connect a wallet,
view multi-chain EVM balances, deploy new 3-of-5 wallets, and collect owner
signatures via **manual QR codes** (camera-to-camera, no WalletConnect) before
executing a transaction.

```bash
# Windows
web.bat

# macOS/Linux
./web.sh
```

See [`web/README.md`](web/README.md) for the full flow, including how owners
sign from `signer.html` on their phone's wallet dApp browser.

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
