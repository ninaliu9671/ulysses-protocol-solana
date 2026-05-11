"use client";

import useSWR from "swr";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { fetchSlashedEvents, type SlashedEvent } from "../events";

/**
 * Single source of truth for Slashed events.
 * Both the Hero strip (totals) and Siren Graveyard (list) read from this
 * shared SWR cache so they don't double-fetch / desync / flicker.
 *
 * Watcher API is the source of truth; chain scan only runs when watcher fails.
 * A successful watcher response (even empty []) shortcircuits — this is what lets
 * EVENT_CUTOFF_TS actually hide old data instead of having chain scan reintroduce it.
 */
export function useSlashedEvents(limit = 50): { events: SlashedEvent[] | undefined; isLoading: boolean } {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const watcherUrl = process.env.NEXT_PUBLIC_WATCHER_URL || "http://localhost:3001";

  const { data: watcherEvents, error: watcherError, isLoading: watcherLoading } = useSWR(
    ["watcher-graveyard", watcherUrl, limit],
    async (): Promise<SlashedEvent[]> => {
      const res = await fetch(`${watcherUrl}/graveyard?limit=${limit}`);
      if (!res.ok) throw new Error(`watcher /graveyard ${res.status}`);
      const json = await res.json();
      const events = json.events as Array<{
        kind: "Slashed" | "Cancelled";
        signature: string;
        blockTime: number;
        commitment: string;
        owner: string;
        principal: string;
        typeName: string | null;
        targetMint: string | null;
        createdAt: number | null;
        expiresAt: number | null;
      }>;
      return events.map((w) => ({
        kind: w.kind,
        signature: w.signature,
        blockTime: w.blockTime,
        commitment: w.commitment,
        owner: w.owner,
        principal: BigInt(w.principal),
        commitmentType: (w.typeName as SlashedEvent["commitmentType"]) || "Unknown",
        targetMint: w.targetMint,
        createdAt: w.createdAt,
        expiresAt: w.expiresAt,
      }));
    },
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );

  // Chain fallback: only fires when watcher errored out.
  const { data: chainEvents, isLoading: chainLoading } = useSWR(
    watcherError ? ["slashed-events", url, limit] : null,
    () => fetchSlashedEvents(url, limit),
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );

  const events = watcherEvents !== undefined ? watcherEvents : chainEvents;
  const isLoading = watcherLoading || (watcherError && chainLoading);
  return { events, isLoading };
}
