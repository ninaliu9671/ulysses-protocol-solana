# Ulysses Protocol — Codebase Entry Point

> Single orientation doc for agents working in this repository. For design rationale, mechanism math, frontend spec, demo plan, and x402 notes, follow the links to upper docs — do not duplicate them here.

## Purpose

A behavioral commitment protocol for disciplined Web3 investors on Solana. Users stake SOL against on-chain commitments about their own future trading behavior. Violators are slashed; compliant stakers earn yield redistributed from slashed stakes via a sub-linear weight formula.

**Tagline**: *Turn your discipline into yield. Turn others' impulse into your reward.*

## Authoritative Docs (read these before changing design)

All upper docs live in the parent directory `..\` (i.e. `D:\Dev3Pack\ulysses-protocol-solana\`):

- **`../DESIGN.md`** — product philosophy, mechanism design, weight math, slashing dynamics, formal proofs, §11.5 conflict matrix, OQ-1..OQ-18 implementation decisions. Source of truth for *what* and *why*.
- **`../FRONTEND.md`** — frontend spec: routes, panels, copy, parameter tables, Compute Budget bug fix.
- **`../DEMO.md`** — 3-min video script, 12-wallet seed plan (28 commitments), judge try-it guide.
- **`../x402-notes.md`** — x402 protocol background and integration posture for Ulysses.
- **`../PLAN_AGENT.md`** — phased implementation plan (phase 0–8), what each phase delivers.
- **`../PLAN_HUMAN.md`** — human-only tasks (H1–H6: wallets, Squads, deploys, demo recording).

## Core Mechanism (one-paragraph)

Commit → Stake → Monitor → Claim or Slash. Weight is `W = floor(sqrt(stake_lamports × duration_days))` (sub-linear in both dimensions). Rewards distributed via O(1) MasterChef accumulator (`acc_reward_per_weight: u128`, PRECISION = 1e9). Single global pool. Stake range capped at 10^17 lamports; duration ∈ [1, 365] days. Lazy claim: post-expiry commitments keep accruing until owner calls `claim`. Full math in `../DESIGN.md` Part II.

## v2 Design Decisions (highlights)

Do not relitigate these without updating `../DESIGN.md`.

- **4 commitment types** (`../DESIGN.md` §11.1–11.4):
  - **NoSell** — balance must not drop below baseline at creation
  - **HoldAbove** — balance must not drop below user-specified `floor_amount` (≤ baseline). Position-floor semantics, no oracle (per OQ-5).
  - **NoTradeWindow** — wallet-scoped; no signed tx during `[start_hour, end_hour)` UTC. Hour-level, multi-window via `nonce`.
  - **AgentGuardian** — wallet-scoped; only `guardian_pubkey` may sign outbound fund-moving txs.
  - Removed: NoBuy (cross-wallet Sybil unenforceable), HoldUntil (redundant).

- **PDA seeds** (per `../DESIGN.md` OQ-2 — authoritative):
  - `NoSell`: `[b"no_sell", owner, target_mint]`
  - `HoldAbove`: `[b"hold_above", owner, target_mint]`
  - `AgentGuardian`: `[b"agent_guard", owner]`
  - `NoTradeWindow`: `[b"no_trade", owner, &nonce.to_le_bytes()]`
  - Vault per commitment: `[b"vault", commitment_pda]`
  - Global pool: `[b"reward_pool"]`
  - **Active = account exists.** Termination closes the account; PDA slot becomes reusable. No `commitment_type_disc` byte in seeds (that was v1).

- **`RewardPool` account** (per `../DESIGN.md` §9.1; not v1's `ProtocolState`):
  ```rust
  pub struct RewardPool {
      pub total_weight: u128,
      pub acc_reward_per_weight: u128,  // PRECISION-scaled
      pub treasury: Pubkey,             // Squads multisig PDA
      pub slash_authority: Pubkey,      // watcher keypair
  }
  ```

- **§11.5 conflict rules** (`../DESIGN.md` §11.5.2 for v2.1 matrix). Type strength ordering: AgentGuardian (wallet-exclusive) > NoSell(mint) > HoldAbove(mint). NoTradeWindow is orthogonal to NoSell/HoldAbove. AgentGuardian and NoTradeWindow are wallet-scoped; NoSell/HoldAbove are (owner, mint)-scoped. Conflicts checked program-side via `remaining_accounts` pattern.

- **4 termination states** (`../DESIGN.md` §11.5.1, OQ-4): **Claimed** / **Slashed** / **Cancelled** / **Voided**. All four call shared `settle_terminated_commitment` helper with different `funds_destination` and `settle_pending_yield`. **Voided is deferred to v2.2** — v2.1 ships only Claim/Slash/Cancel; the create-with-void path is stub-only.

- **Squads multisig treasury** (OQ-3): receives only the last-staker edge-case slash funds. No protocol fee on regular slashes (OQ-7). `slash_authority` and `treasury` are separate fields; treasury has no instruction authority.

- **Lazy Claim** (`../DESIGN.md` §8.4): expiry alone does not auto-terminate. Owner must call `claim`. Yield continues accruing until claimed. UI shows progress >100% as the claim signal.

- **`devnet-seed` Cargo feature** (OQ-15): gates `*_seeded` instructions accepting `commit_timestamp: i64` for backdated history. Hardcoded `SEED_AUTHORITY: Pubkey` const compiled in only under this feature. Mainnet builds do not contain it.

- **Events** (OQ-17 — frontend reads chain directly, no indexer): `Created`, `Claimed`, `Cancelled`, `Slashed`, `Voided` (placeholder for v2.2). Hall of Masts uses `getProgramAccounts`; Siren Graveyard uses `getSignaturesForAddress` + log parsing.

- **Watcher v2.1** (OQ-6, OQ-11): single `slash_authority` keypair, dual-path Helius webhook + 60s polling, full-scan recovery on startup, no DB needed for state (SQLite only as internal cache if useful). Permissionless slash + 5% bounty deferred to v2.2.

## Architecture

### Smart Contract — `anchor/programs/vault/`

(Note: directory is `vault/`, not `ulysses-protocol/`. v1 lib.rs has been removed; recover via `git show v1.0.0` if needed.)

Layout (per `../PLAN_AGENT.md` §1):
- `src/state/` — `RewardPool`, `NoSellCommitment`, `HoldAboveCommitment`, `NoTradeWindowCommitment`, `AgentGuardianCommitment` (one `#[account]` per type, `#[derive(InitSpace)]`).
- `src/utils/` — `math.rs` (`integer_sqrt_u128`), `terminate.rs` (`settle_terminated_commitment`), `errors.rs`.
- `src/instructions/` — per-type `create_*`, `claim_*`, `cancel_*`, `slash_*`; plus `initialize`. `*_seeded` mirrors gated by `#[cfg(feature = "devnet-seed")]`.

### Frontend — `app/`

Next.js 16 + React 19 + `@solana/kit` + Codama-generated client (`app/generated/`) + Tailwind v4. Three routes: `/` (Hero), `/commitment` (form + my commitments + compact boards), `/leaderboard` (full Hall of Masts). See `../FRONTEND.md` for full spec.

**Known bug**: `Computational budget exceeded` on create — fix by prepending `getSetComputeUnitLimitInstruction({ units: 400_000 })` in `app/lib/hooks/use-send-transaction.ts` (`../FRONTEND.md` §10).

### Watcher — `watcher/`

Node.js + Express. Helius webhook (primary, <5s) + 60s polling fallback + startup full-scan. Per-type violation checks (NoSell/HoldAbove: balance sum; NoTradeWindow: tx blockTime hour; AgentGuardian: tx meta pre/post asset diff). `/health` endpoint exposes liveness.

## Current Status

- Branch: **`v2-rewrite`** (do not push to `main` until v2 ships)
- Phase: **0 — preparation in progress** (see `../PLAN_AGENT.md` phase 0). Tasks: doc sync (this file), v1 lib.rs removal, Cargo deps, collect user keypair info.
- v1 preserved at git tag **`v1.0.0`** — recover any v1 file with `git show v1.0.0:<path>`.
- H1 (funder wallet) and H2 (dev wallet) — completed; see `../H1&H2.md` for addresses.
- H3 (Squads multisig), H4–H6 — pending.

## Commands

```bash
npm run setup          # anchor build + codama client regeneration
npm run dev            # Next.js dev server
npm run anchor-test    # LiteSVM tests
npm run codama:all     # regenerate app/generated/ from IDL
solana-test-validator  # local validator

# Anchor + devnet seed feature
cd anchor
anchor build                                              # default (no seed path)
anchor build -- --features devnet-seed                    # seeded build for devnet
anchor deploy --provider.cluster devnet --provider.wallet <DEV_KEYPAIR>
```

## Stack

| Layer            | Tech                                |
|------------------|-------------------------------------|
| Smart contract   | Anchor (Rust), `anchor-spl`         |
| Client gen       | Codama from IDL                     |
| Frontend         | Next.js 16, React 19, TypeScript    |
| Solana client    | `@solana/kit`, wallet-standard      |
| Styling          | Tailwind CSS v4                     |
| Watcher          | Node.js, Express, Helius webhook    |
| Treasury         | Squads v4 multisig (devnet)         |
