# Ulysses Protocol

> **Turn your discipline into yield. Turn others' impulse into your reward.**

A behavioral commitment protocol for disciplined Web3 investors on Solana. Users stake SOL against on-chain rules they choose for themselves. Break the rule and your stake is forfeited; hold firm and you earn yield redistributed from those who didn't.

The name is from Homer's *Odyssey*: Ulysses had himself tied to the mast so he could hear the Sirens' song without steering his ship onto the rocks. Same mechanism, on-chain.

---

## Honest Statement

> **Ulysses cannot stop you from opening another wallet. No on-chain protocol can.**
>
> But Ulysses isn't built to outsmart you. It's built to **help the part of you that already wants to keep its promises**.
>
> When you stake here, you're not trying to fool the protocol — you're tying yourself to the mast. The mast can be untied. **The point is that you chose to tie it.**
>
> If you want a tool to fool yourself with, this isn't it.
> If you want a tool to remember who you decided to be, welcome.

*(See `../DESIGN.md` §5 for the full reasoning behind this position, including why the Sybil problem is structurally bounded by the zero-sum redistribution model.)*

---

## Live Demo

| | |
|---|---|
| **dApp** | <FILL_BEFORE_SUBMIT — Vercel URL> |
| **Demo Video** | <FILL_BEFORE_SUBMIT — YouTube unlisted URL> |
| **Network** | Solana Devnet |
| **Program ID** | [`3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S`](https://explorer.solana.com/address/3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S?cluster=devnet) |
| **Treasury (Squads multisig)** | [`9CYhSzFPXUQRmKncPtBFuPdRMZwumsexcDUVGaULcQo6`](https://explorer.solana.com/address/9CYhSzFPXUQRmKncPtBFuPdRMZwumsexcDUVGaULcQo6?cluster=devnet) |
| **Demo SPL token (POL)** | [`HyNLyBJTk5sBDA7wB64ToK6np35V9uTM9Dk8L8PnEkp2`](https://explorer.solana.com/address/HyNLyBJTk5sBDA7wB64ToK6np35V9uTM9Dk8L8PnEkp2?cluster=devnet) |

---

## How It Works

Four steps, end to end:

1. **Commit.** Pick one of four discipline modes (see below). The mode encodes a rule about your own future trading behavior.
2. **Stake.** Lock SOL behind the vow. Stake amount and duration jointly determine your weight in the reward pool: `weight = floor(sqrt(stake_lamports × duration_days))`. The square root suppresses whale dominance and makes splitting strictly worse than committing in one piece. (Math derivation in `../DESIGN.md` Part II.)
3. **Monitor.** A watcher service tracks the chain. When it detects a violation it submits a `slash_*` transaction on your behalf — the program then verifies the violation on-chain before forfeiting the stake.
4. **Slash or Claim.** If you broke the rule, your stake flows to the reward pool and is redistributed via an O(1) MasterChef-style accumulator to everyone with active commitments. If you held firm to expiry, you call `claim` and get principal + accumulated yield back.

### The Four Commitment Types

| Type | Rule | Scope | Slash trigger |
|---|---|---|---|
| **🔒 NoSell** | Token balance must not drop below the snapshot at creation | Per (owner, mint) | Balance < baseline |
| **📈 HoldAbove** | Token balance must not drop below a user-chosen floor (≤ baseline) | Per (owner, mint) | Balance < floor |
| **⏰ NoTradeWindow** | No signed transactions during a UTC hour window | Per wallet (multi via nonce) | Tx blockTime falls in window |
| **🛡 AgentGuardian** | Only a designated guardian key may move funds out of the wallet | Per wallet, exclusive | Owner-signed tx decreases SOL/SPL balance |

NoSell / HoldAbove are verified on-chain (the program reads remaining_account token balances). NoTradeWindow / AgentGuardian rely on the watcher's keypair as a trusted signer (see `../DESIGN.md` OQ-6 / OQ-11 for why this is the honest design choice rather than a backdoor).

### Lifecycle States

A commitment is always in exactly one of these states:

- 🟢 **Active** — duration not elapsed, no violation
- 🟡 **Unlockable** — duration ended; still accruing yield until you call `claim` (lazy claim)
- ✅ **Claimed** — terminal, principal + yield returned to you
- 💀 **Slashed** — terminal, principal forfeited to reward pool
- ⚫ **Cancelled** — terminal, voluntary early exit, principal forfeited (self-slash)

---

## Try It Yourself (Devnet)

Full commit → violate → slash loop takes about 3 minutes from a fresh wallet. No setup beyond a Solana wallet on devnet.

### What you'll need

- A Solana wallet (Phantom / Solflare / Backpack) set to **devnet**
- ~3 minutes

### Step 1 · Get devnet SOL

Connect your wallet on the live URL above and confirm the network indicator says `devnet`. Then airdrop yourself ~0.5 SOL (anything ≥ 0.05 is enough for one full commit-and-slash loop):

```bash
solana airdrop 1 <YOUR_WALLET> --url devnet
```

Or use any web faucet (e.g. <https://faucet.solana.com>).

### Step 2 · Try the easiest mode first — NoTradeWindow

NoTradeWindow doesn't require holding any specific token, so it's the fastest path to seeing the full slash loop.

1. Go to **Commitment** in the nav.
2. Set **Type** to `⏰ NoTradeWindow`.
3. Pick a UTC window that includes **right now** (e.g. if it's 10:00 UTC, set window 09:00 → 12:00).
4. **Duration**: click `7d`. **Stake**: `0.05` SOL.
5. Click **Create Commitment**, sign in your wallet.
6. Once the row shows up in **My Commitments** as 🟢 Active, sign any other transaction from this wallet — even a 0.0001 SOL self-transfer in your wallet UI counts.
7. Within ~60 seconds the watcher detects the violation and submits a slash. Refresh and the row flips to 💀 Slashed; **Siren Graveyard** on `/leaderboard` gets a new red entry.

### Step 3 · Try NoSell with the demo token (POL)

If you want to test the on-chain balance check:

1. Get some POL: <FILL_BEFORE_SUBMIT — faucet form / instructions, or ask the team>
2. Create a `🔒 NoSell` against POL mint `HyNLyBJTk5sBDA7wB64ToK6np35V9uTM9Dk8L8PnEkp2`.
3. Send any amount of POL out of your wallet from Phantom (any address works — burn `1nc1nerator11111111111111111111111111111111` is fine).
4. The watcher slashes within ~60 seconds.

### Step 4 · Try the other two types

- `📈 HoldAbove` — same as NoSell but you choose a custom floor in tokens. Must be ≤ your current balance.
- `🛡 AgentGuardian` — paste any pubkey other than your own as the guardian; then send funds *from your own key* — slash.

### Diagnostic

If something doesn't work:

| Symptom | Likely cause | Fix |
|---|---|---|
| Wallet shows mainnet balance | Wallet not on devnet | Phantom → Settings → Developer Settings → Devnet |
| `Computational budget exceeded` | Stale build cache | Hard refresh |
| No slash after 90 s | Watcher down or RPC throttled | `<FILL_BEFORE_SUBMIT>/health` should show `last_poll_completed` within 60 s |
| `BaselineZero` (#6003) on NoSell create | Wallet holds zero of that token | Get the token first (or use NoTradeWindow) |

---

## What This Protocol Is *NOT*

In the spirit of §5's honest framing:

- ❌ A tool to help you decide what to invest in — we have no opinion on assets
- ❌ A tool to prevent fraud or scams — we cannot evaluate token quality
- ❌ A tool to generate yield from nothing — yield is **redistributed**, not magicked
- ❌ A tool to force discipline on unwilling users — opt-in only
- ❌ A tool to outsmart users who want to circumvent it — see `../DESIGN.md` §5
- ❌ Multi-wallet evasion detection — using a second wallet to sell does not slash your first wallet's commitment, by design
- ❌ A real Pyth-oracle HoldAbove — the threshold is a token-balance floor, not a USD floor
- ❌ Mainnet — devnet only for v2.1 hackathon submission

---

## Architecture

```
ulysses-protocol/
├── anchor/programs/vault/      # Anchor program (Rust) — 4 types × {create, claim, cancel, slash}
│   ├── src/state/              # NoSell/HoldAbove/NoTradeWindow/AgentGuardianCommitment + RewardPool
│   ├── src/instructions/       # Per-type instructions + seeded.rs (devnet-seed feature)
│   └── src/utils/              # math (integer_sqrt_u128), terminate (settle helper), errors
├── app/                        # Next.js 16 + React 19 + @solana/kit + Tailwind v4
│   ├── generated/vault/        # Codama client from IDL
│   ├── components/             # NavBar, hero, commitment form, my-commitments, leaderboard, …
│   ├── lib/                    # rpc, events, hooks, wallet, commitment-types
│   ├── docs/                   # /docs route — renders DOCS.md with sticky TOC + KaTeX + SVG diagrams
│   ├── commitment/page.tsx     # /commitment route
│   └── leaderboard/page.tsx    # /leaderboard route — Hall of Masts + Siren Graveyard
├── watcher/                    # Node.js + Express — Helius webhook + 60s polling + startup full-scan
│   ├── chain.js                # Account discriminators + deserializers
│   ├── patrol.js               # Per-type violation checks
│   └── slash.js                # Submit slash instruction
└── scripts/
    ├── initialize.mjs          # One-time RewardPool init
    └── seed-devnet.mjs         # 12 wallets × ~24 commitments seed (DEMO.md §2)
```

Upper-level docs (philosophy, math, frontend spec, demo plan, x402 notes) live in the parent directory:

- `../DESIGN.md` — product philosophy, mechanism design, formal proofs, OQ-1..OQ-18 implementation decisions
- `../FRONTEND.md` — frontend spec: routes, panels, copy, parameter tables
- `../DEMO.md` — 3-min video script, 12-wallet seed plan (24 commitments), judge try-it guide
- `../x402-notes.md` — x402 protocol background and integration posture
- `../PLAN_AGENT.md` — phased implementation plan
- `../PLAN_HUMAN.md` — human-only tasks (wallets, Squads, deploys, demo recording)

The in-app `/docs` page is a polished, public-facing version of the protocol's mechanism explanation.

---

## Stack

| Layer | Technology |
|---|---|
| Smart contract | Anchor 0.30 (Rust), `anchor-spl` |
| Client gen | Codama from Anchor IDL |
| Frontend | Next.js 16, React 19, TypeScript |
| Solana client | `@solana/kit`, wallet-standard |
| Styling | Tailwind CSS v4 |
| Watcher | Node.js, Express, Helius webhook (optional) |
| Treasury | Squads v4 multisig |

---

## Local Development

```bash
npm install
npm run setup         # anchor build + codama client regeneration
npm run dev           # Next.js dev server on http://localhost:3000
npm run anchor-test   # LiteSVM unit tests on the program

# Watcher (optional — only needed to verify slash flow locally)
cd watcher && npm install && node index.js
# Health endpoint: http://localhost:3001/health
```

The `devnet-seed` Cargo feature gates `seed_create_*` instructions for backdated seed data (see `../DESIGN.md` OQ-15). Mainnet builds do not contain this code path.

```bash
cd anchor
anchor build                         # default — no seed path
anchor build -- --features devnet-seed   # seeded build for devnet population
anchor deploy --provider.cluster devnet --provider.wallet ~/solana-dev-keypair.json
```

---

## Status

**Devnet only. v2.1 hackathon submission.**

Deferred to v2.2: permissionless slash + 5% bounty, Voided termination path with strength-based replacement, oracle-driven HoldAbove, mainnet audit + governance.
