"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { fetchClaimedEventsGlobal, type ClaimedEventGlobal } from "../events";

/**
 * All Claimed events globally (for Hall of Masts Earned aggregation).
 * Watcher API is primary (full history, honors EVENT_CUTOFF_TS); chain scan is fallback.
 * Merged by signature with watcher taking priority.
 */
export function useClaimedEvents(): ClaimedEventGlobal[] | undefined {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);

  const watcherUrl = process.env.NEXT_PUBLIC_WATCHER_URL || "http://localhost:3001";
  const { data: watcherClaimed } = useSWR(
    ["watcher-claimed"],
    async () => {
      try {
        const res = await fetch(`${watcherUrl}/claimed?limit=500`);
        if (!res.ok) return null;
        const json = await res.json();
        return json.events as Array<{
          signature: string;
          owner: string;
          principal: string;
          yieldPaid: string | null;
        }>;
      } catch {
        return null;
      }
    },
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );

  const { data: chainClaimed } = useSWR(
    ["claimed-events-global", url],
    () => fetchClaimedEventsGlobal(url, 100),
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );

  return useMemo<ClaimedEventGlobal[] | undefined>(() => {
    const merged = new Map<string, ClaimedEventGlobal>();

    if (watcherClaimed) {
      for (const w of watcherClaimed) {
        merged.set(w.signature, {
          signature: w.signature,
          owner: w.owner,
          principal: BigInt(w.principal),
          yieldPaid: w.yieldPaid ? BigInt(w.yieldPaid) : 0n,
        });
      }
    }

    if (chainClaimed) {
      for (const c of chainClaimed) {
        if (!merged.has(c.signature)) merged.set(c.signature, c);
      }
    }

    if (merged.size === 0 && !watcherClaimed && !chainClaimed) return undefined;
    return Array.from(merged.values());
  }, [watcherClaimed, chainClaimed]);
}
