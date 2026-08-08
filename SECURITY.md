# Security Policy

## Project status

**This project has not undergone a third-party security audit.**

`MultiSigWallet.sol` is a self-contained skeleton, written and reviewed
manually, with a test suite covering the core execution paths. It compiles
cleanly and passes all included tests — but "passes tests" and "audited"
are not the same thing. Treat this as a solid starting point for your own
review, not a guarantee.

**Do not deploy this with funds you cannot afford to lose until you (or
someone you trust) has personally read every line of the contract and
understands exactly what it does.**

---

## What this contract protects against

- ✅ **Replay attacks** — every transaction is bound to a per-wallet
  `nonce` and the EIP-712 domain separator (`chainId` + contract address),
  so a signed transaction cannot be replayed on another chain, another
  deployment, or after it has already executed.
- ✅ **Threshold bypass** — `executeTransaction` only proceeds once the
  number of *valid, distinct owner* signatures reaches the configured
  threshold; duplicate or unsorted signatures are rejected.
- ✅ **Non-owner signatures** — any signature not from a current owner is
  rejected, even if it's otherwise cryptographically valid.
- ✅ **Unauthorized owner rotation** — `setOwners` can only be called by
  the contract itself (`onlySelf`), meaning owner/threshold changes
  require the same M-of-N approval as any other transaction. There is no
  external admin key that can override this.

## What this contract does NOT protect against

- ❌ **A compromised owner private key.** If enough individual owner keys
  are compromised to reach the threshold, funds can be moved — this is
  inherent to any M-of-N scheme, not specific to this implementation.
  Store each key on a separate device or hardware wallet.
- ❌ **Signing a malicious transaction.** The contract cannot know
  whether the `to`/`value`/`data` you're signing is what you actually
  intended. The CLI does not currently decode calldata into a
  human-readable summary — **always verify the raw transaction details
  yourself before running `sign`.**
- ❌ **RPC endpoint trust.** The CLI reads on-chain state (nonce, owners,
  threshold) through whatever `RPC_URL` you configure. A malicious or
  compromised RPC could theoretically lie to the `info` command. Use an
  RPC provider you trust, or run your own node.
- ❌ **Front-running / MEV on public mempools.** Once a transaction with
  enough signatures is broadcast, it sits in the mempool like any other
  transaction until mined. This contract does not include any
  MEV-protection or private-mempool submission logic.
- ❌ **Coordination channel security.** Signatures are exchanged off-chain
  over whatever channel you choose (Signal, email, etc.). This project
  makes no claims about the security of that channel — a leaked
  signature for a *specific* transaction can be submitted by anyone, so
  treat collected signatures as sensitive until the threshold is met and
  submitted.

---

## Reporting a vulnerability

If you find a security issue in the contract or CLI:

1. **Do not open a public GitHub issue.**
2. Report it privately via GitHub's **[Private vulnerability reporting](../../security/advisories/new)**
   (Security tab → "Report a vulnerability"), or reach out to
   **RNVETERNAL** directly through the contact listed on the GitHub
   profile.
3. Include: which file/function is affected, a description of the issue,
   and — if possible — a minimal reproduction (a failing test case is
   ideal).

There is currently no bug bounty program for this project. Reports are
still very welcome and will be credited in the changelog/README unless
you prefer otherwise.

---

## Supported versions

This is a single-version skeleton project — there are no older
maintained releases. Security fixes will be applied to `main` directly.

| Version | Supported |
| ------- | --------- |
| `main`  | ✅        |

---

<sub>This document describes the security posture as of the current
`main` branch. It is not a substitute for an independent audit.</sub>
