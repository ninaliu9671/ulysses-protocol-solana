"use client";

import useSWR from "swr";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { fetchClaimedEventsGlobal, type ClaimedEventGlobal } from "../events";

export function useClaimedEvents(): ClaimedEventGlobal[] | undefined {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const { data } = useSWR(
    ["claimed-events-global", url],
    () => fetchClaimedEventsGlobal(url, 100),
    { refreshInterval: 120_000, dedupingInterval: 60_000 },
  );
  return data;
}
