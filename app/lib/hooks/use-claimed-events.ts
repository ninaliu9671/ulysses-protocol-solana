"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { fetchClaimedEventsGlobal, type ClaimedEventGlobal } from "../events";

/**
 * All Claimed events globally (for Hall of Masts Earned aggregation).
 * Watcher API is the source of truth; chain scan only runs when watcher fails.
 * A successful watcher response (even empty []) shortcircuits — this is what lets
 * EVENT_CUTOFF_TS actually hide old data instead of having chain scan reintroduce it.
 */
export function useClaimedEvents(): ClaimedEventGlobal[] | undefined {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const watcherUrl = process.env.NEXT_PUBLIC_WATCHER_URL || "http://localhost:3001";

  // Watcher fetch: throws on failure so SWR sets `error`, which lets us distinguish
  // "empty success" from "not yet loaded" from "failed".
  const { data: watcherClaimed, error: watcherError } = useSWR(
    ["watcher-claimed"],
    async (): Promise<ClaimedEventGlobal[]> => {
      const res = await fetch(`${watcherUrl}/claimed?limit=500`);
      if (!res.ok) throw new Error(`watcher /claimed ${res.status}`);
      const json = await res.json();
      const events = json.events as Array<{
        signature: string;
        owner: string;
        principal: string;
        yieldPaid: string | null;
      }>;
      return events.map((w) => ({
        signature: w.signature,
        owner: w.owner,
        principal: BigInt(w.principal),
        yieldPaid: w.yieldPaid ? BigInt(w.yieldPaid) : 0n,
      }));
    },
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );

  // Chain fallback: only fires when watcher errored out.
  const { data: chainClaimed } = useSWR(
    watcherError ? ["claimed-events-global", url] : null,
    () => fetchClaimedEventsGlobal(url, 100),
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );

  return useMemo<ClaimedEventGlobal[] | undefined>(() => {
    if (watcherClaimed !== undefined) return watcherClaimed;
    return chainClaimed;
  }, [watcherClaimed, chainClaimed]);
}
