# Ulysses Protocol

> **Turn your discipline into yield. Turn others' impulse into your reward.**

A behavioral commitment protocol for disciplined Web3 investors on Solana. Users stake SOL against on-chain rules they choose for themselves. Break the rule and your stake is forfeited; hold firm and you earn yield redistributed from those who didn't.

The name is from Homer's *Odyssey*: Ulysses had himself tied to the mast so he could hear the Sirens' song without steering his ship onto the rocks. Same mechanism, on-chain.

---

## Live Demo

| | |
|---|---|
| **dApp** | [https://ulysses-protocol-solana.vercel.app/](https://ulysses-protocol-solana.vercel.app/) |
| **Demo Video** | https://www.youtube.com/watch?v=KrhYt-MnYGM |
| **Watcher health** | [https://ulysses-protocol-solana-production.up.railway.app/health](https://ulysses-protocol-solana-production.up.railway.app/health) — open in any browser to confirm slash bot is live 24/7 |
| **Network** | Solana Devnet |
| **Program ID** | [`3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S`](https://explorer.solana.com/address/3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S?cluster=devnet) |
| **Treasury (Squads multisig)** | [`9CYhSzFPXUQRmKncPtBFuPdRMZwumsexcDUVGaULcQo6`](https://explorer.solana.com/address/9CYhSzFPXUQRmKncPtBFuPdRMZwumsexcDUVGaULcQo6?cluster=devnet) |
| **Demo SPL token (POL)** | [`HyNLyBJTk5sBDA7wB64ToK6np35V9uTM9Dk8L8PnEkp2`](https://explorer.solana.com/address/HyNLyBJTk5sBDA7wB64ToK6np35V9uTM9Dk8L8PnEkp2?cluster=devnet) |

---

## How It Works

Four steps, end to end:

1. **Commit.** Pick one of four discipline modes (see below). The mode encodes a rule about your own future trading behavior.
2. **Stake.** Lock SOL behind the vow. Stake amount and duration jointly determine your weight in the reward pool: `weight = floor(sqrt(stake_lamports × duration_days))`. The square root suppresses whale dominance and makes splitting strictly worse than committing in one piece.
3. **Monitor.** A watcher service tracks the chain. When it detects a violation it submits a `slash_*` transaction on your behalf — the program then verifies the violation on-chain before forfeiting the stake.
4. **Slash or Claim.** If you broke the rule, your stake flows to the reward pool and is redistributed via an O(1) MasterChef-style accumulator to everyone with active commitments. If you held firm to expiry, you call `claim` and get principal + accumulated yield back.

### The Four Commitment Types

| Type | Rule | Scope | Slash trigger |
|---|---|---|---|
| **🔒 NoSell** | Token balance must not drop below the snapshot at creation | Per (owner, mint) | Balance < baseline |
| **📈 HoldAbove** | Token balance must not drop below a user-chosen floor (≤ baseline) | Per (owner, mint) | Balance < floor |
| **⏰ NoTradeWindow** | No signed transactions during a UTC hour window | Per wallet (multi via nonce) | Tx blockTime falls in window |
| **🛡 AgentGuardian** | Only a designated guardian key may move funds out of the wallet | Per wallet, exclusive | Owner-signed tx decreases SOL/SPL balance |

NoSell / HoldAbove are verified on-chain (the program reads the user's token accounts directly). NoTradeWindow / AgentGuardian rely on the watcher as a trusted detector — the watcher cannot fabricate violations, only submit slashes the program will accept.

**Coming in future versions.** The four types above are deliberately the smallest set that already exercises every shape of commitment we know how to verify honestly. The roadmap includes more single-user rules in the same shape:

- **🚫 NoBuy** — symmetric to NoSell: target token balance must not increase.
- **⏱ MaxTradesPerDay(N)** — at most N trades on the target mint per UTC day.
- **❄️ CooldownBetweenTrades(secs)** — minimum interval between two trades on the target mint.
- **🛟 MustExitBelow(mint, threshold)** — must sell once balance drops below a threshold.
- **🪜 MaxLeverage(x)** — leverage on perp protocols (Drift / Mango / Jupiter Perps) must stay below x× while the commitment is active.

If you want a type that isn't here, open an issue — the on-chain abstraction (commitment account + reward-pool accumulator + slash authority) is general enough to absorb most ideas.

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
6. Once the row shows up in **My Commitments** as 🟢 Active, sign any other transaction from this wallet — even a 0.0001 SOL self-transfer counts.
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

We state this openly because:

- The honest framing is philosophically stronger than pretending we've solved Sybil. Ulysses sits in the long lineage of voluntary commitment devices, all of which share this limitation by design.
- The economics work anyway. All rewards come from slashed stakes — a strictly zero-sum redistribution among participants. A Sybil attacker cannot extract value from nothing; they can only put real value in and lose it.
- Every commitment type we offer is one where Sybil circumvention defeats the user's own purpose. Moving the asset to a second wallet to sell it *is* the violation the user committed against in the first place.

---

## Architecture

```
ulysses-protocol/
├── anchor/programs/vault/      # Anchor program (Rust) — 4 types × {create, claim, cancel, slash}
│   ├── src/state/              # NoSell/HoldAbove/NoTradeWindow/AgentGuardianCommitment + RewardPool
│   ├── src/instructions/       # Per-type instructions
│   └── src/utils/              # integer sqrt, settle helper, errors
├── app/                        # Next.js 16 + React 19 + @solana/kit + Tailwind v4
│   ├── generated/vault/        # Codama client from IDL
│   ├── components/             # NavBar, hero, commitment form, my-commitments, leaderboard, …
│   ├── lib/                    # rpc, events, hooks, wallet, commitment-types
│   ├── docs/                   # /docs route — sticky TOC + KaTeX + SVG diagrams
│   ├── commitment/page.tsx     # /commitment route
│   └── leaderboard/page.tsx    # /leaderboard route — Hall of Masts + Siren Graveyard
├── watcher/                    # Node.js + Express — Helius webhook + 60s polling + startup full-scan
│   ├── chain.js                # Account discriminators + deserializers
│   ├── patrol.js               # Per-type violation checks
│   └── slash.js                # Submit slash instruction
└── scripts/
    ├── initialize.mjs          # One-time RewardPool init
    └── seed-devnet.mjs         # Devnet leaderboard seed
```

The in-app `/docs` route is the public-facing protocol documentation (mechanism, math, lifecycle).

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

---

## Status

**Devnet only. v2.1 hackathon submission.**

Deferred to v2.2: permissionless slash + 5% bounty, Voided termination path with strength-based replacement, oracle-driven HoldAbove, mainnet audit + governance, the additional commitment types listed under *Coming in future versions* above.
