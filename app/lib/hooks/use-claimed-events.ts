"use client";

import useSWR from "swr";
import type { ClaimedEventGlobal } from "../events";

// Watcher is the sole source of truth. No chain fallback — chain scan ignores
// EVENT_CUTOFF_TS and would reintroduce pre-reset data.
export function useClaimedEvents(): ClaimedEventGlobal[] | undefined {
  const watcherUrl = process.env.NEXT_PUBLIC_WATCHER_URL || "http://localhost:3001";

  const { data } = useSWR(
    ["watcher-claimed", watcherUrl],
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

  return data;
}
