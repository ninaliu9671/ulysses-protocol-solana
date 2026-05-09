# Ulysses Protocol — Docs

> *Turn your discipline into yield. Turn others' impulse into your reward.*

---

## 0. The Mast and the Sirens

In Homer's *Odyssey*, Ulysses had to sail past the Sirens — supernatural voices whose song lured every sailor who heard them onto the rocks. He wanted to hear the song. He also wanted to live. So he devised a precommitment device:

> *"Bind me hard and fast to the mast, and if I beg you to set me free, tighten the ropes further."*

This is the original commitment device. Ulysses did not trust his future self to remain rational under the Sirens' spell. He trusted his **present self** — calm, deliberate, clear-eyed — to construct constraints his future self could not escape.

Every investor in crypto faces some version of this voyage. The thesis is formed in a calm moment. The temptation arrives later: a 40% drawdown at 2 AM, a Twitter thread predicting doom, a green candle on a coin you swore you wouldn't touch. The rational self had a plan. The impulsive self has the wallet.

**Ulysses Protocol is the digital mast.** You bind your decisions on-chain at the moment you're clear-headed, knowing the Sirens will come. The protocol does not eliminate temptation — it raises the cost of yielding to it. And it does one more thing: **the cost paid by people who break their commitments flows directly to people who keep theirs.** Discipline yields discipline.

---

## 1. The Problem — Why Discipline Fails in Crypto

### 1.1 The Two-Selves Problem

Behavioral economics has long recognized that a human being is not one rational agent but a **multi-self system in conflict** (Schelling 1984; Thaler & Shefrin 1981). In trading contexts:

- **The Planner Self** (Kahneman's *System 2*): deliberate, analytical, long-term oriented. Forms strategies during calm market conditions.
- **The Doer Self** (*System 1*): reactive, emotional, short-term oriented. Acts when prices move violently, when others post gains, or at 3 AM scrolling charts.

The standard tragedy: the Planner builds a thesis (*"I'll hold this for 6 months"*), the Doer overrides it (*"Just this once, I'll take profits early"*). After the fact, the Planner regrets. Before the fact, the Planner had no enforcement mechanism.

The two selves are not metaphor — they map onto distinct neural systems with different timescales of valuation. They genuinely disagree about what is optimal. Without a binding commitment, the self that holds the keys at the moment of decision wins, every time.

### 1.2 Why Web3 Amplifies the Problem

Crypto markets are uniquely hostile to the Planner Self:

1. **24/7 markets** — no closing bell to enforce a circuit breaker on impulse
2. **Extreme volatility** — daily 50%+ moves are routine, triggering loss aversion and FOMO simultaneously
3. **Frictionless execution** — one-click swaps remove the cooling-off pause that traditional brokerages impose
4. **Social-driven price action** — Twitter, Telegram, Discord generate constant temptation streams
5. **Self-custody** — no advisor, no compliance officer, no trusted third party who can refuse a bad trade

The sovereignty Web3 grants you also removes every existing safeguard against your own worst impulses. Self-sovereignty without self-discipline is a recipe for self-destruction.

### 1.3 The Execution Gap

DALBAR's annual *Quantitative Analysis of Investor Behavior* (QAIB) consistently finds that the average equity investor underperforms the S&P 500 by **3–5 percentage points per year** — not because their strategies are bad, but because they fail to follow them. The gap between *investment returns* (what the strategy would have produced) and *investor returns* (what humans actually realized) is the cost of behavioral failure.

Key mechanisms documented in the literature:

- **Disposition effect** (Shefrin & Statman 1985) — selling winners too early, riding losers too long
- **Loss aversion** (Kahneman & Tversky 1979) — pain of a loss ~2× the joy of an equivalent gain, leading to capitulation at lows
- **Recency bias** (Tversky & Kahneman 1973) — weighting recent price action more than fundamentals
- **Action bias** (Patt & Zeckhauser 2000) — preferring action over inaction even when inaction is optimal

The striking conclusion: **most investors already know what they should do.** They just can't make themselves do it. The bottleneck is not analysis — it is execution.

Ulysses Protocol targets that gap. It does not pick assets. It does not generate alpha. It does not tell you what to invest in. It only ensures that decisions you have already made are decisions you actually keep.

---

## 2. The Solution — A Commitment Device

### 2.1 What a Commitment Device Is

A **commitment device** is a tool that lets your present self bind your future self. The seminal academic literature (Strotz 1955; Schelling 1984; Bryan, Karlan & Nelson 2010) establishes three foundational results:

1. **Time-inconsistent preferences are universal.** Present-self and future-self routinely disagree about what is optimal.
2. **Voluntary commitment devices improve welfare** for time-inconsistent agents — even when they reduce optionality. Reduced freedom is the *feature*, not the cost.
3. **An effective commitment device shares three properties:**
   - **Easy to enter** — low friction at the rational moment, so the Planner can actually deploy it
   - **Hard to renegotiate** — otherwise the impulsive self talks the Planner out of it later
   - **Costly to break** — otherwise it isn't binding at all

Real-world examples: Christmas savings clubs (Thaler 1980), StickK.com (Ayres et al. 2009 — bet money against your goals, lose it to a charity if you fail), Beeminder, the Philippines SEED savings program (Ashraf, Karlan & Yin 2006 — produced *measurable* increases in savings rates among users who self-selected in).

### 2.2 What Ulysses Adds

Ulysses Protocol is a commitment device for crypto investors, with three innovations over its predecessors:

1. **Slashed funds redistribute to compliant users** — not lost to a charity or a counterparty. This creates **positive-sum incentives within the disciplined community** rather than transferring value out of it.
2. **The penalty scales with the user's own stake** — the cost is calibrated to the user's own utility, not a flat external fine.
3. **Enforcement is algorithmic and trustless** — on-chain monitoring, no referee, no human discretion that can be lobbied or corrupted.

The result is a structure where discipline is not just protected — it is **rewarded**, by the people who fail to maintain it.

---

## 3. The Four Commitment Types

Ulysses Protocol offers four commitment types. They are not arbitrary — each addresses a specific, well-documented behavioral pathology, and each is structured around one shared design property:

> **The committed asset must physically remain in the committed wallet for the commitment to be meaningful.**

This is the linchpin. It means the obvious "workaround" — moving funds to a different wallet — *is itself the violation*. The escape hatch and the trapdoor are the same hatch. We'll come back to this in §7 when we discuss what the protocol can and cannot honestly claim to do.

### 3.1 NoSell — Conviction Hold

> *"I have done the research on this token. I am convinced it should be held for the next 180 days. I know that on the inevitable 40% drawdown, I will be tempted to capitulate. Bind me to my thesis."*

**Commitment.** Your balance of a chosen token will not decrease below the level you held when the commitment was created. Buying more is fine. Selling below the snapshot is a violation.

**Violation rule.** If `balance(target_token, your_wallet) < baseline_at_creation`, the commitment is in violation and can be slashed.

**Behavioral pathology addressed.** The **disposition effect** (Shefrin & Statman 1985) — the well-documented tendency to sell winners too early and ride losers too long. Empirical studies estimate this costs retail investors 1–4% annually in foregone returns.

**Who this is for.** The value investor, the long-thesis holder, the conviction HODLer who knows they will be tested.

### 3.2 HoldAbove — Position Floor

> *"I have 5,000 PEPE. 4,000 are for active trading — I can take profits, rebalance, whatever. But 1,000 is my long-term core position. Bind me from ever cutting into the core, even when I'm convinced the trade idea is good."*

**Commitment.** Your balance of a chosen token will not fall below a floor *you specify*. Sales above the floor are permitted; the floor itself is untouchable.

**Violation rule.** If `balance(target_token, your_wallet) < floor_amount`, the commitment is in violation. The floor is set by you at creation and must be ≤ your current balance.

**Relationship to NoSell.** When `floor = full baseline`, HoldAbove is equivalent to NoSell. When `floor < baseline`, HoldAbove is strictly weaker — you've reserved some of the position as tradeable. Pick whichever framing matches your intent.

**Behavioral pathology addressed.** **Loss aversion overshoot** (Kahneman & Tversky 1979) combined with the mental accounting practice of separating a long-term core from a tactical sleeve. Many investors think this way already; HoldAbove lets them enforce that mental separation on-chain.

**Who this is for.** The active trader who wants the floor of their core position to be untouchable, even by themselves.

### 3.3 NoTradeWindow — Impulse Time Lockout

> *"I know I make bad trades after midnight. I commit to not trading at all between 00:00 and 05:00 UTC for the next 90 days."*

**Commitment.** During the hour window you specify, no transaction signed by your wallet is permitted. Not just swaps — *any* signed transaction.

**Violation rule.** Any wallet-signed transaction whose blockchain timestamp falls inside `[window_start_hour, window_end_hour)` UTC is a violation.

**Why "any transaction" rather than just trades.** The behavioral commitment you're making is *don't open the wallet during this window*, not *don't trade tokens specifically*. If you're awake at 3 AM logged into your wallet doing "just one little thing," the next bad trade is one click away. The strict definition matches the underlying behavioral goal.

**Boundaries.** Half-open `[start, end)` — the start hour is inside, the end hour is outside. If `end ≤ start`, the window wraps across midnight (e.g. `22:00–05:00`). Hour-level precision only — minute-level granularity isn't useful for the patterns this addresses.

**Behavioral pathology addressed.** **Ego depletion** (Baumeister et al. 1998) and **circadian risk-taking** — well-documented patterns of impulsivity during sleep-deprived or low-self-regulation periods. Plus the Web3-specific pathology of doomscrolling charts at night.

**Who this is for.** The self-aware impulse-controller who has identified their own weakness pattern in time.

### 3.4 AgentGuardian — Hands-Off Delegation

> *"I've deployed an Agent with a tested strategy. The worst thing I can do is interfere mid-cycle. I commit to not manually transacting from this wallet for 90 days — the Agent is in charge."*

**Commitment.** During the commitment period, only a designated guardian public key (your Agent, or a trusted human signer) may sign transactions that move funds out of the wallet. Your own signature on outbound transactions is a violation.

**Violation rule.** Any owner-signed transaction during the commitment period that moves funds out of the wallet (SOL transfers, SPL token transfers, swaps, any CPI that decreases the wallet's asset balances). Pure account-creation transactions with no fund movement are exempt — otherwise routine wallet maintenance would falsely trigger slashes.

**Behavioral pathology addressed.** **Action bias** (Patt & Zeckhauser 2000) — the documented preference for action over inaction even when inaction is optimal. Plus the specific pattern of **strategy interference**: traders override their own systematic strategies mid-cycle due to short-term noise, systematically reducing long-run returns.

**Who this is for.** The systematic trader, the Agent deployer, the "set it and forget it" discipline-seeker who knows their biggest threat is themselves.

### 3.5 Coexistence Rules

You can hold multiple commitments simultaneously, with these constraints:

| Combination | Allowed? |
|---|---|
| NoSell on token X + NoSell on token Y | ✅ Yes (different tokens) |
| NoSell on token X + HoldAbove on token X | ❌ No (HoldAbove is weaker — meaningless to layer) |
| NoSell or HoldAbove + NoTradeWindow | ✅ Yes (orthogonal — one is *what*, the other is *when*) |
| Multiple NoTradeWindow with different windows | ✅ Yes (e.g. 00:00–05:00 *and* 22:00–24:00) |
| AgentGuardian + anything else | ❌ **No — AgentGuardian is exclusive** |

**Why AgentGuardian must be exclusive.** AG delegates execution to a separate signer. If a NoSell or NoTradeWindow commitment coexisted with AG, the Agent's perfectly legitimate trades would trigger spurious slashes — your commitments would be fighting each other. So AG is the *only* active commitment a wallet can hold during its lifetime.

The app blocks conflicting combinations at creation with a clear message — you don't have to memorize this table.

---

## 4. The Mechanism — How Weight and Rewards Work

This section explains exactly how the protocol turns your commitment into a position in the reward pool, and how the math determines what you earn. There is nothing hidden — the whole engine is a few lines of arithmetic, and you should understand it before you stake.

### 4.1 The Weight Formula

When you create a commitment, the protocol assigns it a **weight**:

$$\boxed{W = \sqrt{\text{stake} \times \text{days}}}$$

Where `stake` is your locked SOL (in lamports, the on-chain unit) and `days` is the commitment duration. Weight is what determines your share of every future reward distribution.

**Why a square root, and not just `stake × days` directly?** Two reasons rooted in real economics:

1. **Diminishing marginal disutility of capital.** The 100,001st dollar you lock up does not feel 100,001× as costly as the first dollar. Subjective cost is concave in objective cost — this is the basic insight behind every utility function since Bernoulli (1738) and Prospect Theory (Kahneman & Tversky 1979). The weight formula should reflect *utility cost*, not *nominal cost*.

2. **Sub-linear weighting from the Quadratic Voting literature.** Lalley & Weyl (2018) prove that under standard utility assumptions, sub-linear pricing of "voice" yields Pareto-optimal preference aggregation. The same mathematics that makes Quadratic Voting fair makes √-weighted commitments fair: it prevents a single large staker from dominating the pool while still rewarding scale.

**Quick reference table.** Weight at common combinations of stake and duration:

| Stake | 1 day | 30 days | 90 days | 365 days |
|---|---|---|---|---|
| 0.1 SOL | 10,000 | 54,772 | 94,868 | 191,049 |
| 1 SOL | 31,623 | 173,205 | 300,000 | 604,152 |
| 10 SOL | 100,000 | 547,723 | 948,683 | 1,910,497 |
| 100 SOL | 316,228 | 1,732,051 | 3,000,000 | 6,041,523 |

Notice: a 1000× larger stake yields only a ~31.6× larger weight. A 365× longer duration yields only a ~19.1× larger weight. Both dimensions are compressed identically — capital and time are treated as equal partners in commitment, neither dominating the other.

### 4.2 Three Properties This Formula Buys You

The choice of √(stake × days) is not aesthetic. It is a *mechanism design* decision that produces three concrete fairness properties, each provable from the formula.

#### Property 1 — Whale Suppression

A whale staking $k$× a normal user's capital, at the same duration, receives only $\sqrt{k}$× the weight.

$$\frac{W_{\text{whale}}}{W_{\text{normal}}} = \frac{\sqrt{kC \cdot T}}{\sqrt{C \cdot T}} = \sqrt{k}$$

**Consequence.** A 1000× capital advantage compresses to ~31.6× weight advantage. Combined with the per-weight diminishing return of a fixed reward pool (each additional unit of total weight reduces the slice each unit gets), the protocol is structurally inhospitable to whale dominance. Small stakers stay competitive on a per-SOL basis.

#### Property 2 — Sybil Resistance (Within-Wallet)

If a user splits a stake $C$ across $n$ commitments, total weight grows only as $\sqrt{n}$ — and each commitment also pays its own rent and gas, making the split strictly worse than a unified stake.

$$W_{\text{split into } n} = n \cdot \sqrt{\frac{C}{n} \cdot T} = \sqrt{n} \cdot \sqrt{CT}$$

So two commitments of $C/2$ each give $\sqrt{2}\sqrt{CT} \approx 1.414\sqrt{CT}$ — only a 41% boost from a 100% split, before subtracting the doubled overhead. Splitting actively destroys utility.

*(Cross-wallet Sybil — opening multiple Solana wallets — is philosophically unsolvable on-chain. We address this honestly in §7.)*

#### Property 3 — Splitting Penalty (The Conviction Theorem)

This is the most consequential property of the design. Suppose a user wants to commit capital $C$ over a total time $T$. They have two strategies:

- **Unsplit.** One commitment of $C$ for $T$ days.
- **Split.** $n$ rolling commitments of $C$ each for $T/n$ days, immediately re-staking each time.

Even if the user is continuously present for the entire $T$, and even if total capital deployed is identical, the math says:

$$\boxed{\frac{R_{\text{split into } n}}{R_{\text{unsplit}}} = \frac{1}{\sqrt{n}}}$$

**Consequence table:**

| Splits $n$ | Reward fraction | Loss vs unsplit |
|---|---|---|
| 1 (no split) | 100.0% | 0% |
| 2 | 70.7% | 29% |
| 3 | 57.7% | 42% |
| 4 | 50.0% | 50% |
| 7 (weekly over 7 weeks) | 37.8% | 62% |
| 30 (daily over a month) | 18.3% | 82% |

**What this means.** Every reconsideration costs you. The protocol does not reward people who keep rolling short commitments to preserve optionality — it mathematically rewards conviction expressed up front. If you genuinely believe in a 90-day thesis, commit to 90 days. Doing nine 10-day rolls instead costs you ~67% of your expected reward.

This is by design. The whole point of a commitment device is that you don't get to renegotiate with yourself every week.

### 4.3 Reward Distribution — The Accumulator

When someone gets slashed, their forfeited stake has to be split among compliant stakers in proportion to weight. With potentially thousands of stakers, the naïve approach — *"loop over every staker and add their share"* — is computationally infeasible on Solana (it would blow the per-transaction compute budget).

So Ulysses uses a well-known pattern from the DeFi staking world (originating in SushiSwap's MasterChef contract): a **single global accumulator** updated once per slash event, with each user's reward computed lazily from the accumulator's value at entry vs claim.

#### How It Works

The protocol maintains one global counter, `accRewardPerWeight`, which represents *the cumulative reward earned by every unit of weight, since the beginning of time*.

When a slash of amount $S$ occurs and the total weight in the pool at that moment is $T_{\text{total}}$, the accumulator advances:

$$\text{accRewardPerWeight} \mathrel{+}= \frac{S}{T_{\text{total}}}$$

That single update — $O(1)$ — has effectively distributed $S$ across every unit of weight in the pool, in proportion. No per-staker loop required.

#### How You Collect Your Share

When you create a commitment, the protocol records the current accumulator value as your **entry snapshot** (technically called `reward_debt`). When you later call `claim`, your accrued reward is:

$$\boxed{R_u = W_u \cdot \big(\text{acc}_{\text{now}} - \text{acc}_{\text{entry}}\big)}$$

In words: *your weight, times the accumulator's growth during your stay*. You receive your weight's share of every slash that happened *between your entry and your claim*, and nothing else.

This design has one beautiful consequence: **late entry buys you nothing.** A user who joins right after a big slash event sees the accumulator's *current* value snapshotted as their entry — they cannot reach back and claim a share of slashes that already happened. There is no "wait for a big violation, then jump in" exploit. The mechanism is fair across all entry times by construction.

#### Why This Math Is Correct

It is straightforward to verify that the lazy accumulator gives every user *exactly* the share a naïve per-slash loop would have given. The accumulator's growth from your entry time $t_0$ to your claim time $t$ is:

$$\text{acc}(t) - \text{acc}(t_0) = \sum_{s \,\in\, \text{slashes}(t_0, t)} \frac{S_s}{T_s}$$

Multiplying by your weight $W_u$:

$$W_u \cdot \big(\text{acc}(t) - \text{acc}(t_0)\big) = \sum_{s} W_u \cdot \frac{S_s}{T_s} = \sum_{s} \underbrace{\frac{W_u}{T_s}}_{\text{your share at slash } s} \cdot S_s$$

Which is exactly the per-slash share, summed across every slash during your stay. The lazy version is mathematically identical to the naïve version — it just runs in $O(1)$ instead of $O(n)$.

### 4.4 A Worked Example

Let's run actual numbers so you can see your reward as a calculation, not a black box.

**Setup.**
- You stake **1 SOL for 30 days** → your weight $W_u = \sqrt{1{,}000{,}000{,}000 \times 30} \approx 173{,}205$
- The total weight in the pool when you join is $T_{\text{total}} = 12{,}000{,}000$
- The accumulator at entry: $\text{acc}_{\text{entry}} = 5{,}000{,}000$ *(some arbitrary historical value)*
- Your share of the pool: $W_u / T_{\text{total}} \approx 1.44\%$

**Slash event during your stay.** A user violates a NoSell commitment and forfeits **2 SOL** = $2{,}000{,}000{,}000$ lamports. At the moment of the slash, total weight (now including yours) is $12{,}173{,}205$.

The accumulator advances:

$$\Delta \text{acc} = \frac{2{,}000{,}000{,}000}{12{,}173{,}205} \approx 164.3$$

*(In the real implementation the accumulator is multiplied by a precision factor to avoid integer-division precision loss — we're omitting that here for clarity. The economic result is identical.)*

Your share of *this single slash*:

$$W_u \times \Delta \text{acc} = 173{,}205 \times 164.3 \approx 28{,}458{,}000 \text{ lamports} \approx 0.0285 \text{ SOL}$$

Which is exactly $W_u / T_{\text{total}}$ × slash amount = $1.44\% \times 2 \text{ SOL} \approx 0.0285$ SOL. Sanity checked.

**Multiple slashes during your stay.** Suppose three more slashes occur during your 30-day commitment, of 1, 0.5, and 3 SOL respectively, with total weight roughly stable. The accumulator at your claim time:

$$\text{acc}_{\text{now}} = \text{acc}_{\text{entry}} + 164.3 + 82.2 + 41.1 + 246.5 = 5{,}534.1$$

Your total reward:

$$R_u = W_u \times (\text{acc}_{\text{now}} - \text{acc}_{\text{entry}}) = 173{,}205 \times 534.1 \approx 92{,}500{,}000 \text{ lamports} \approx 0.0925 \text{ SOL}$$

So you earned **~0.0925 SOL on a 1 SOL × 30-day commitment** — a 9.25% return over 30 days, purely from other users' broken promises. You also get your 1 SOL principal back at claim. This is what the **Yield** column in your dashboard represents, computed live every time the chain state updates.

Note what this number depends on:
- **Total slash volume during your stay** — if no one violates, you earn nothing (zero-sum redistribution from violators only)
- **Your share of the pool** — bigger pool means smaller individual slice
- **Length of your commitment** — more time = more slashes captured

There is no minted yield, no inflationary token, no "APY" assumption. Every lamport you earn comes from someone who broke a promise.

---

## 5. The Lifecycle of a Commitment

A commitment moves through a small number of states. Understanding the state machine is understanding what can happen to your stake.

### 5.1 The State Diagram

<!-- DIAGRAM:state -->

Four terminal states. Three of them — Slashed, Cancelled, Claimed — close the commitment account on-chain and free up the slot. Unlockable is a transitional state where time has expired but you haven't yet pulled the trigger.

### 5.2 The Four Outcomes

| State | Trigger | Principal | Pending Yield | Already-Claimed Yield |
|---|---|---|---|---|
| **Claimed** | You call `claim` after expiry | Returned to you | Paid out | Yours |
| **Slashed** | A watcher detects your violation | Forfeited to reward pool | Forfeited | Yours |
| **Cancelled** | You voluntarily exit early | Forfeited to reward pool | Forfeited | Yours |
| **Unlockable** | Duration ended, you haven't claimed yet | (still locked) | Still accruing | — |

A few things worth noting:

- **Slashed and Cancelled have identical economic outcomes.** A voluntary cancel is a self-slash. The protocol does not care whether the watcher caught you or whether you preempted the watcher — your stake is forfeited either way. This is intentional: see §5.4.
- **Yield you've already claimed is yours forever.** No clawback. If you've been claiming intermediate yield (a feature in some interfaces), violation later does not retroactively recover that.
- **The reward pool is a strict zero-sum redistribution.** Every lamport forfeited by a violator flows to compliant stakers in proportion to weight. The protocol takes nothing.

### 5.3 Unlockable: What Happens After Expiry

When your commitment's duration ends, it does not automatically claim itself. It moves into **Unlockable** state and waits for you to call `claim`. Two important consequences:

1. **You keep accruing.** While Unlockable, your weight continues to count toward the pool, and you continue to earn from new slashes. Your displayed progress can exceed 100% (e.g. 105%, 120%) — that's the visible signal that you've been Unlockable for some time.
2. **You're blocking your own slot.** As long as the commitment account exists on-chain, it occupies the wallet's PDA slot for that commitment type and target. You cannot create a conflicting new commitment (e.g. a new NoSell on the same token) until you claim the old one.

The protocol does not auto-expire commitments because doing so would require either an expensive on-chain scan at every slash event or a separate "expire" instruction someone must call. The lazy-claim model is simpler and gives you full control over timing — claim when it suits you.

### 5.4 Cancellation: The Rope Cannot Be Untied for Free

You can cancel a commitment at any time before expiry. The economic outcome is identical to a slash: **you forfeit your principal and any pending yield.** There is no grace period, no time-windowed undo, no "oops" button.

This is a deliberate design choice. A commitment device only works if breaking it is costly. A frictionless cancel button gives the impulsive self an easy escape route, defeating the entire purpose. The Ulysses metaphor demands the rope cannot be untied without cost — that is the *point*.

The app does protect you against accidental clicks: cancel triggers a type-to-confirm modal that explicitly states the financial consequence ("You will lose all X SOL"). But once you confirm, the transaction goes through, and the funds are gone the moment the chain accepts it.

If you find yourself wanting to cancel, the right question is: *was the original commitment a mistake, or is the present moment a moment of weakness?* The protocol cannot tell the difference for you. But it does ensure that whichever it is, the answer costs you something.

---

## 6. How to Use It

### 6.1 Connect a Wallet

Click **Connect** in the top-right corner. The protocol runs on Solana **Devnet** — the badge in the header shows the active network. You'll need a small amount of devnet SOL to stake; you can get it from any public Solana faucet, or from a terminal:

```
solana airdrop 1 <your-wallet-address> --url devnet
```

For token-based commitments (NoSell, HoldAbove), you'll also need to already hold some of the target SPL token in your wallet — the protocol cannot commit to holding a position you don't have.

### 6.2 Create a Commitment

Go to the **Commitment** tab and fill in the form:

1. **Pick a type.** NoSell, HoldAbove, NoTradeWindow, or AgentGuardian. (See §3 for what each one binds you to.)
2. **Set the parameters specific to your type:**
   - *NoSell* / *HoldAbove*: select the target token (must be one you currently hold). For HoldAbove, also set the floor amount.
   - *NoTradeWindow*: pick the start and end hour in **UTC**. The form shows a local-time preview so you can sanity-check, but the on-chain value is UTC. If your end hour is ≤ start hour, the window wraps across midnight.
   - *AgentGuardian*: paste the guardian public key (your Agent's address, or a trusted signer's).
3. **Set the stake amount** (in SOL) and **duration** (in days, 1–365).

As you fill the form, the panel below shows three numbers, computed live:

- **Your weight** = √(stake × days)
- **Network total weight** at this moment
- **Your share of the pool** = your weight / total — the fraction of every future slash that flows to you

When you click **Stake**, the wallet pops up to sign a single transaction. The transaction transfers your SOL into a vault PDA owned by the protocol, creates the commitment account, and records your entry snapshot of the accumulator. From this moment on, you are bound to the mast.

### 6.3 Track Your Commitment

The **My Commitments** panel on the home page shows every commitment you currently hold. For each one:

- **Time remaining** — countdown to expiry (or 100%+ progress if you're Unlockable)
- **Stake** — your locked principal
- **Weight** — your share of the pool
- **Pending yield** — your accumulated reward, ticking up live whenever any other user gets slashed anywhere in the protocol

The **Leaderboard** tab shows two views:

- **Hall of Masts** — top stakers ranked by accumulated yield, ROI, and total commitment weight
- **Siren Graveyard** — recent slashes, who got slashed, on what type, for how much

Both views are read directly from the chain — there is no off-chain database, no indexer, no possibility of the displayed numbers diverging from the on-chain truth. What you see is the chain.

### 6.4 Claim at Expiry

When your commitment's duration ends, the **My Commitments** panel marks it 🟡 **Unlockable** and shows a prominent **Claim** button. Click it, sign one transaction, and the protocol does the following atomically:

1. Pays out your accumulated yield (computed from the accumulator delta, per §4.3)
2. Returns your full principal to your wallet
3. Closes the commitment account (rent refunded to you, the slot freed for new commitments)

There is no deadline. You can leave a commitment Unlockable for as long as you like — it will keep accruing yield in the meantime. But you cannot create a conflicting new commitment until the old one is claimed (its slot is still occupied).

### 6.5 Cancel (if you must)

The **Cancel** button on an active commitment opens a confirmation modal. To proceed, you must type the exact amount of SOL you are about to forfeit. This is intentional friction — accidental cancellation has the same economic consequence as a watcher-detected slash, and we don't want a misclick to cost you your principal.

If you confirm and sign, the cancel goes through immediately: principal forfeited to the reward pool, pending yield zeroed, account closed. There is no undo from this point.

---

## 7. The Honest Statement — What This Protocol Is *Not*

Ulysses Protocol cannot prevent a determined user from circumventing their own commitment by using a different wallet. **No purely on-chain protocol can.** Any system claiming otherwise either relies on centralized identity verification (KYC, contradicting Web3 values) or on personhood proofs (Worldcoin, Civic — currently impractical at scale and themselves trust-dependent).

We state this openly because pretending otherwise would be dishonest, and any sophisticated reviewer would identify the gap immediately.

That said: **the four commitment types we offer are deliberately chosen so that the obvious workaround is itself the violation.** To dodge a NoSell by selling from another wallet, you have to first move the tokens out of the committed wallet — which *is* the action NoSell prohibits. To dodge an AgentGuardian by trading from elsewhere, you've already abandoned the strategy AG was meant to protect. The escape hatches we cannot close are escape hatches that defeat the user's own purpose.

This is not perfect, and we don't pretend it is. But it is honest, and it is enough.

### The Statement

> **Ulysses cannot stop you from opening another wallet. No on-chain protocol can.**
>
> But Ulysses isn't built to outsmart you. It's built to **help the part of you that already wants to keep its promises**.
>
> When you stake here, you're not trying to fool the protocol — you're tying yourself to the mast. The mast can be untied. **The point is that you chose to tie it.**
>
> If you want a tool to fool yourself with, this isn't it.
> If you want a tool to remember who you decided to be, welcome.

---

## 8. FAQ

**Does this actually generate yield?**
Only if other users break their commitments. Yield is redistributed from violators, not minted. If everyone in the pool is perfectly disciplined, you simply get your principal back at expiry — no reward, but no loss either. Realistically, behavioral patterns in a population of users ensure a steady flow of slashes.

**What does the protocol take?**
Nothing. Zero protocol fee on slashes. 100% of forfeited stake flows to compliant stakers, in proportion to weight. *(Edge case: if you are the only staker in the pool when you violate, your stake goes to a multisig treasury since there is no one to redistribute to. Statistically rare.)*

**Why a square root, why not just `stake × days`?**
Because subjective cost is concave in objective cost — locking up your 100,001st dollar does not feel 100,001× as costly as your first. The √ formula reflects utility cost rather than nominal cost, suppresses whale dominance, and penalizes Sybil splitting. See §4.1 for the full reasoning, and §4.2 for the concrete fairness properties this buys.

**What tokens are supported?**
For NoSell and HoldAbove, any standard SPL token you already hold in your wallet. **Rebasing tokens are not supported** — their supply changes mid-commitment would break the violation check, and we explicitly do not handle that case.

**Can I have multiple commitments at once?**
Yes — different tokens, different windows, different types — subject to the coexistence rules in §3.5. AgentGuardian is the only exclusive type (it cannot coexist with anything else on the same wallet).

**Can I change a commitment after creating it?**
No. To replace one commitment with another, you'd have to cancel the existing one (forfeiting your stake) and create the new one fresh. This is intentional — easy renegotiation defeats the entire purpose of a commitment device.

**What if I miss the claim deadline?**
There is no claim deadline. After expiry, your commitment sits in **Unlockable** state and keeps accruing yield until you call `claim`. There is no penalty for claiming late — but you also cannot create a conflicting new commitment until you do, since the old account still occupies its slot. See §5.3.

**What does "violation" mean exactly?**
It depends on the type. For NoSell / HoldAbove, it's any net token outflow that drops your balance below the floor. For NoTradeWindow, it's any signed transaction inside the forbidden hour window. For AgentGuardian, it's any owner-signed transaction during the commitment that moves funds out of the wallet. The exact rules are spelled out per type in §3.

**What happens to slashed funds if I'm the only person staked?**
They go to the protocol's multisig treasury rather than the reward pool, because there is no one else to redistribute to. This is an edge case noted for completeness — under any meaningful adoption it doesn't apply.

**Can I claim partial yield without ending the commitment?**
Not in the current version. Yield accrues continuously to your account, and is paid out at the moment you claim — which also returns your principal and ends the commitment.

**What stops a watcher from slashing me incorrectly?**
The slash instruction enforces the violation check on-chain. The watcher cannot fabricate a violation — it can only execute a slash transaction, and the program rejects the transaction if the on-chain state does not actually meet the violation condition. The watcher is a convenience (someone has to submit the transaction), not a trust point.

**Is this audited?**
The protocol currently runs on Solana devnet. It is not audited. Treat it accordingly — stake amounts you would be comfortable losing if a bug surfaced.

**Where can I read more?**
This document is the user-facing reference. The complete formal specification — including additional theorems, the reward accumulator's full correctness proof, mechanism design constraints, and on-chain implementation details — is maintained alongside the open-source code in this repository.

---

*Ulysses Protocol · A digital mast for disciplined investors on Solana.*
