"use client";

import useSWR from "swr";
import type { SlashedEvent } from "../events";

// Watcher is the sole source of truth. No chain fallback — chain scan ignores
// EVENT_CUTOFF_TS and would reintroduce pre-reset data.
export function useSlashedEvents(limit = 50): { events: SlashedEvent[] | undefined; isLoading: boolean } {
  const watcherUrl = process.env.NEXT_PUBLIC_WATCHER_URL || "http://localhost:3001";

  const { data: events, isLoading } = useSWR(
    ["watcher-graveyard", watcherUrl, limit],
    async (): Promise<SlashedEvent[]> => {
      const res = await fetch(`${watcherUrl}/graveyard?limit=${limit}`);
      if (!res.ok) throw new Error(`watcher /graveyard ${res.status}`);
      const json = await res.json();
      const raw = json.events as Array<{
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
      return raw.map((w) => ({
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

  return { events, isLoading };
}
