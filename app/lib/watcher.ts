// Watcher API client
// Set NEXT_PUBLIC_WATCHER_URL in .env.local (defaults to localhost for dev)

export const WATCHER_URL =
  process.env.NEXT_PUBLIC_WATCHER_URL ?? "http://localhost:3001";

export interface WatcherCommitment {
  pubkey: string;
  owner: string;
  target_mint: string;
  commitment_type: string; // JSON string e.g. '{"type":"NoBuy"}'
  stake_amount: string;    // lamports as string
  is_active: number;       // 1 or 0
  created_at: number;
  first_seen_at: number;
}

export interface WatcherSlashEvent {
  id: number;
  pubkey: string;
  owner: string;
  target_mint: string;
  amount: string;  // lamports as string
  tx_sig: string;
  slashed_at: number;
}

export async function fetchWatcherCommitments(): Promise<WatcherCommitment[]> {
  const res = await fetch(`${WATCHER_URL}/commitments`);
  if (!res.ok) throw new Error("Watcher /commitments failed");
  return res.json();
}

export async function fetchWatcherHistory(): Promise<WatcherSlashEvent[]> {
  const res = await fetch(`${WATCHER_URL}/history`);
  if (!res.ok) throw new Error("Watcher /history failed");
  return res.json();
}

// Parse commitment_type JSON field safely
export function parseCommitmentType(raw: string): { type: string } {
  try { return JSON.parse(raw); } catch { return { type: "Unknown" }; }
}

// Shorten an address for display: "8mQf…ef12"
export function shortAddr(addr: string): string {
  if (addr.length <= 8) return addr;
  return addr.slice(0, 4) + "…" + addr.slice(-4);
}

// Lamport string → SOL number
export function lamportsToSol(lamports: string | number): number {
  return Number(lamports) / 1e9;
}

// Seconds ago label
export function timeAgo(unixSecs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSecs;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
