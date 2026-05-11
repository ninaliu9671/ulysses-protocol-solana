"use client";

import useSWR from "swr";
import { useMemo } from "react";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { fetchSlashedEvents, type SlashedEvent } from "../events";

/**
 * Single source of truth for Slashed events.
 * Both the Hero strip (totals) and Siren Graveyard (list) read from this
 * shared SWR cache so they don't double-fetch / desync / flicker.
 * Merges watcher API (persistent, cross-device) with chain scan (fallback).
 */
export function useSlashedEvents(limit = 50): { events: SlashedEvent[] | undefined; isLoading: boolean } {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);

  // Watcher graveyard API (persistent, includes Cancelled)
  const watcherUrl = process.env.NEXT_PUBLIC_WATCHER_URL || "http://localhost:3001";
  const { data: watcherGraveyard } = useSWR(
    ["watcher-graveyard", watcherUrl, limit],
    async () => {
      try {
        const res = await fetch(`${watcherUrl}/graveyard?limit=${limit}`);
        if (!res.ok) return null;
        const json = await res.json();
        return json.events as Array<{
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
      } catch {
        return null;
      }
    },
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );

  // Chain scan (fallback)
  const { data: chainEvents, isLoading } = useSWR(
    ["slashed-events", url, limit],
    () => fetchSlashedEvents(url, limit),
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );

  // Merge: watcher takes priority, dedup by signature
  const events = useMemo(() => {
    const merged = new Map<string, SlashedEvent>();

    // Add watcher events first (priority)
    if (watcherGraveyard) {
      for (const w of watcherGraveyard) {
        merged.set(w.signature, {
          kind: w.kind,
          signature: w.signature,
          blockTime: w.blockTime,
          commitment: w.commitment,
          owner: w.owner,
          principal: BigInt(w.principal),
          commitmentType: (w.typeName as any) || "Unknown",
          targetMint: w.targetMint,
          createdAt: w.createdAt,
          expiresAt: w.expiresAt,
        });
      }
    }

    // Add chain events (only if not already present)
    if (chainEvents) {
      for (const c of chainEvents) {
        if (!merged.has(c.signature)) {
          merged.set(c.signature, c);
        }
      }
    }

    // Sort by blockTime DESC
    return Array.from(merged.values()).sort((a, b) => (b.blockTime || 0) - (a.blockTime || 0));
  }, [watcherGraveyard, chainEvents]);

  return { events: events.length > 0 ? events : undefined, isLoading };
}
