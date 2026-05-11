# Demo 10k Display Multiplier

**Date:** 2026-05-11  
**Status:** Approved

## Context

Devnet faucets dispense only 0.5–2 SOL at a time. Raw devnet balances (e.g. 0.0012 SOL staked, 0.000003 SOL yield) make the demo unconvincing for judges. All displayed and input SOL amounts should appear 10,000× larger than the real on-chain values, so the demo reads like a real-scale protocol. The on-chain program is never touched; this is a pure frontend concern.

To disable demo mode for mainnet: set `DEMO_MULTIPLIER = 1` in `app/lib/lamports.ts`.

## Core Utility Layer

**File:** `ulysses-protocol/app/lib/lamports.ts`

Add:

```ts
export const DEMO_MULTIPLIER = 10_000;

// Display: lamports → magnified SOL string
export function lamportsToDisplaySol(lamports: bigint | number, decimals = 2): string {
  return (Number(lamports) / 1e9 * DEMO_MULTIPLIER).toFixed(decimals);
}

// Input: user-typed "display SOL" → real lamports for on-chain use
export function displaySolToLamports(displaySol: number): bigint {
  return BigInt(Math.floor(displaySol / DEMO_MULTIPLIER * 1e9));
}
```

Existing `lamportsFromSol` / `lamportsToSolString` are untouched.

## Component Changes

### Display-only (replace inline `/ 1e9` with `lamportsToDisplaySol()`)

| File | Fields |
|------|--------|
| `app/components/hero-section.tsx` | Active Staked, Total Slashed, Total Redistributed (~3 places) |
| `app/components/my-commitments.tsx` | stake, yield (pending), loss, earned (~5 places) |
| `app/components/leaderboard-section.tsx` | earned, pending, live stake, total yield (~4 places) |
| `app/components/siren-graveyard.tsx` | slashed amount (1 place) |

### Bidirectional (input + display)

| File | Changes |
|------|---------|
| `app/components/create-commitment-form.tsx` | Input parsing → `displaySolToLamports()`; weight/share preview display → `lamportsToDisplaySol()` |

**ROI percentage**: unaffected — numerator and denominator scale by the same factor, ratio unchanged.

## Footer Disclaimer

**File:** `ulysses-protocol/app/components/site-footer.tsx`

Add one centered line in English alongside the existing `Built on Solana · Devnet · v2.1` text:

> Demo mode · All SOL amounts are ×10,000 the on-chain value. Inputs scale down automatically.

Style: `text-xs`, low-saturation gold or muted gray, `text-center`, consistent with existing footer typography.

## Verification

1. Start dev server (`npm run dev`)
2. Connect a devnet wallet with a known balance (e.g. 1.5 SOL) — hero stats and my-commitments should show amounts ×10,000
3. Enter `500` in the stake input → on-chain tx should submit `0.05 SOL` (= 50,000,000 lamports)
4. After claiming, yield shown should equal actual lamport yield ×10,000
5. Footer on `/`, `/commitment`, `/leaderboard` shows the disclaimer centered
6. ROI % should remain mathematically correct
