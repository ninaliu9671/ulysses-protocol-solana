# Ulysses Protocol — Solana (Dev3Pack Hackathon 2026)

## What This Project Does
A behavioral commitment protocol for disciplined Web3 investors.

Users stake SOL to make on-chain commitments about their own future trading behavior.
If they violate the commitment → they get slashed (stake confiscated).
Compliant stakers earn yield redistributed from slashed stakes.

**Tagline**: *Turn your discipline into yield. Turn others' impulse into your reward.*

**Authoritative design docs** (read these before making design decisions):
- `DESIGN.md` — product philosophy + mechanism design (math, theory, proofs)
- `FRONTEND.md` — frontend spec (layout, copy, parameter tables, known bugs)

## Core Mechanism
Commit → Stake → Monitor → Slash or Claim

1. User chooses a commitment type and parameters (e.g., "don't sell PEPE for 90 days")
2. User stakes SOL as collateral; commitment goes active
3. Watcher monitors on-chain activity for violations
4. Violation detected → `slash()` called → stake redistributed via accumulator pattern
5. No violation + duration expired → `claim()` returns principal + accumulated yield

## Key Design Decisions (v2 — already settled, do not relitigate)

### Weight formula
**`W = sqrt(stake_lamports × duration_days)`**
- Single global pool (NOT per-type pools)
- `sqrt(C × T)` is the geometric mean of capital and time — both dimensions get sub-linear treatment
- Splitting penalty theorem: splitting an N-day commitment into n equal pieces yields `1/√n` of unsplit reward
- See `DESIGN.md` Part II §7 for full derivation

### Duration
- Range: **1–365 days**
- The v1 "3-day cap" is removed

### Commitment types (v2 supports 4)
1. **NoSell** — don't reduce SPL balance for target_mint
2. **HoldAbove** — same mechanism as NoSell in v2; `threshold_price` is advisory metadata (Pyth integration deferred to v2.5+)
3. **NoTradeWindow** — wallet-scoped; no signed transactions during `[window_start, window_end)` UTC
4. **AgentGuardian** — wallet-scoped; only `guardian_pubkey` may sign outbound fund-moving txs

**Removed in v2**: NoBuy (cross-wallet Sybil makes it unenforceable), HoldUntil (redundant with NoSell + duration)

### Reward distribution
- O(1) MasterChef accumulator pattern: `acc_reward_per_weight` global counter
- `reward_debt` entry snapshot — each staker only collects rewards from slashes after their entry
- u128 storage with PRECISION=1e9 scaling to prevent integer division loss

### Cancellation = Voluntary Slash
There is no "cancel and refund." `cancel_commitment` executes the same state transitions as `slash`. The Ulysses metaphor demands the rope cannot be untied without cost.

### What this protocol is NOT
- Not a fraud-prevention tool — we don't evaluate token quality
- Not a yield farm — yield is strictly redistributed from violators, never from emissions
- Not Sybil-resistant across wallets — explicitly acknowledged in `DESIGN.md` Part I §5. The 4 supported types are designed such that cross-wallet circumvention defeats the user's own purpose.

## Solana Architecture

### Smart Contract (`anchor/programs/ulysses-protocol/`)

**Accounts**:
- `ProtocolState` PDA — seeds: `[b"protocol"]` — holds `acc_reward_per_weight: u128`, `total_weight: u64`, `pool_balance: u64`, treasury authority. **Single global pool** (not per-type arrays in v2).
- `CommitmentAccount` PDA — seeds: `[b"commitment", owner, target_mint, &[commitment_type_disc]]` — holds owner, type-specific params, `stake_amount`, `weight`, `reward_debt: u128`, `unlock_time`, `baseline_balance` (for NoSell/HoldAbove).
- `commitment_vault` SystemAccount PDA — seeds: `[b"vault", commitment_account_pubkey]` — holds escrowed lamports per commitment.
- `protocol_vault` SystemAccount PDA — seeds: `[b"protocol_vault"]` — holds redistributed reward pool.

Note: `target_mint` for wallet-scoped types (NoTradeWindow, AgentGuardian) uses `Pubkey::default()` as a placeholder.

### Instructions
- `initialize()` — create ProtocolState, set watcher authority
- `create_commitment(type, params, stake_amount, duration_days)` — create CommitmentAccount + vault, escrow lamports, update accumulator entry snapshot
- `slash(commitment_account, evidence)` — watcher-only, redistribute stake to `acc_reward_per_weight`, close account
- `cancel_commitment(commitment_account)` — owner-signed; identical state transitions to `slash`
- `claim(commitment_account)` — after expiry; return principal + `weight × (acc_now - acc_entry) / PRECISION`

### Frontend (`app/`)
Next.js 16 + React 19 + @solana/kit + Codama-generated client + Tailwind v4.

Key routes:
- `/` — Hero (Bind yourself before temptation arrives)
- `/commitment` — main working surface (renamed from `/how-it-works`)
- `/leaderboard` — Hall of Masts standalone

Key panels: Create Commitment form (type-conditional fields), My Commitments, Hall of Masts, Siren Graveyard.

See `FRONTEND.md` for full layout, field-by-field parameter tables, copy, and styling decisions.

### Watcher (`watcher/`)
Node.js + Helius webhook (primary) + 60s polling patrol (fallback).

Per-type detection logic:
- **NoSell / HoldAbove**: monitor target_mint SPL balance against `baseline_balance` snapshot
- **NoTradeWindow**: monitor any wallet-signed tx with timestamp inside the configured UTC window
- **AgentGuardian**: monitor outbound fund-moving txs whose signer ≠ `guardian_pubkey` (pure account creations exempt)

Violation → calls `slash` instruction with evidence (tx signature).

## Hackathon Requirements (Solana Track, $10,000)
- [ ] Unique Solana program in Rust (Anchor), deployed to devnet
- [ ] Contract deployment address in README
- [ ] Public GitHub repo with setup instructions
- [ ] Demo video ≤ 3 minutes + live demo link
- [ ] Bonus: x402 payment protocol integration ($500 extra) — use for commitment creation fee + decentralized watcher bounty

## Known Issues / Open Questions
Full list in `DESIGN.md` Part IV. Highlights:
- **OQ-1** (P0): rewrite `integer_sqrt` as pure-integer Newton iteration on u128 (current `f64.sqrt` is fragile)
- **OQ-2** (P0): PDA seeds need to include `commitment_type` discriminator (currently only `[owner, mint]`)
- **OQ-8** (P0): add `baseline_balance` field for NoSell/HoldAbove violation detection
- **Frontend bug** (`FRONTEND.md` §10): `Computational budget exceeded` — fix by prepending `setComputeUnitLimit(400_000)` instruction in `use-send-transaction.ts`

## Commands
```bash
npm run setup        # anchor build + codama client regeneration
npm run dev          # Next.js dev server
npm run anchor-test  # LiteSVM tests
solana-test-validator  # Local validator
```

## Stack
| Layer | Tech |
|-------|------|
| Smart contract | Anchor (Rust) |
| Client generation | Codama from IDL |
| Frontend | Next.js 16, React 19, TypeScript |
| Solana client | @solana/kit, wallet-standard |
| Styling | Tailwind CSS v4 |
| Watcher | Node.js, Helius webhook |
| DB | SQLite + Sequelize |
