"use client";

import useSWR from "swr";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { fetchSlashedEvents, type SlashedEvent } from "../events";

/**
 * Single source of truth for Slashed events.
 * Both the Hero strip (totals) and Siren Graveyard (list) read from this
 * shared SWR cache so they don't double-fetch / desync / flicker.
 */
export function useSlashedEvents(limit = 50): { events: SlashedEvent[] | undefined; isLoading: boolean } {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const { data, isLoading } = useSWR(
    ["slashed-events", url, limit],
    () => fetchSlashedEvents(url, limit),
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );
  return { events: data, isLoading };
}
