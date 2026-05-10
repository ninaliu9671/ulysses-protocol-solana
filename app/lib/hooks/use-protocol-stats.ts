"use client";

import useSWR from "swr";
import { fetchWatcherStats, type WatcherStats } from "../watcher";

/**
 * Authoritative lifetime totals from the watcher backend.
 *   total_slashed_lamports       = Σ Slashed.principal (lifetime)
 *   total_redistributed_lamports = Σ Claimed.yield_paid (lifetime)
 * Invariant: total_slashed >= total_redistributed.
 *
 * The watcher is the single source of truth; the frontend no longer samples
 * the last-100 program signatures (which was unreliable and caused values to
 * jitter between refreshes).
 */
export function useProtocolStats(): { stats: WatcherStats | undefined; isLoading: boolean } {
  const { data, isLoading } = useSWR(
    ["watcher-stats"],
    () => fetchWatcherStats(),
    { refreshInterval: 30_000, dedupingInterval: 15_000 },
  );
  return { stats: data, isLoading };
}
