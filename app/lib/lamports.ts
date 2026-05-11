import { lamports, type Lamports } from "@solana/kit";

const LAMPORTS_PER_SOL = 1_000_000_000n;

export const DEMO_MULTIPLIER = 10_000;

export function lamportsToDisplaySol(amount: bigint | number, decimals = 2): string {
  return (Number(amount) / 1e9 * DEMO_MULTIPLIER).toFixed(decimals);
}

export function displaySolToLamports(displaySol: number): bigint {
  return BigInt(Math.floor((displaySol / DEMO_MULTIPLIER) * 1e9));
}

export function lamportsFromSol(sol: number): Lamports {
  return lamports(BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL))));
}

export function lamportsToSolString(amount: Lamports, maxDecimals = 2): string {
  const whole = amount / LAMPORTS_PER_SOL;
  const fractional = amount % LAMPORTS_PER_SOL;

  if (fractional === 0n) return whole.toString();

  const decimals = fractional.toString().padStart(9, "0").slice(0, maxDecimals);

  if (decimals.replace(/0+$/, "") === "") return whole.toString();

  return `${whole}.${decimals.replace(/0+$/, "")}`;
}
