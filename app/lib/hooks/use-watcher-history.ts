"use client";

import useSWR from "swr";

export type WatcherEvent = {
  kind: "Slashed" | "Cancelled" | "Claimed";
  owner: string;
  principal: bigint;
  yieldPaid: bigint;
};

async function fetchHistory(watcherUrl: string): Promise<WatcherEvent[]> {
  const [graveyardRes, claimedRes] = await Promise.all([
    fetch(`${watcherUrl}/graveyard?limit=1000`),
    fetch(`${watcherUrl}/claimed?limit=500`),
  ]);
  const events: WatcherEvent[] = [];

  if (graveyardRes.ok) {
    const json = await graveyardRes.json();
    for (const e of json.events ?? []) {
      events.push({
        kind: e.kind as "Slashed" | "Cancelled",
        owner: e.owner,
        principal: BigInt(e.principal),
        yieldPaid: 0n,
      });
    }
  }

  if (claimedRes.ok) {
    const json = await claimedRes.json();
    for (const e of json.events ?? []) {
      events.push({
        kind: "Claimed",
        owner: e.owner,
        principal: BigInt(e.principal),
        yieldPaid: e.yieldPaid ? BigInt(e.yieldPaid) : 0n,
      });
    }
  }

  return events;
}

export function useWatcherHistory(): WatcherEvent[] | undefined {
  const watcherUrl = process.env.NEXT_PUBLIC_WATCHER_URL || "http://localhost:3001";
  const { data } = useSWR(
    ["watcher-history", watcherUrl],
    () => fetchHistory(watcherUrl),
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );
  return data;
}
