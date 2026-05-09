"use client";

import useSWR from "swr";
import { useCluster } from "./cluster-context";
import { getClusterUrl } from "../lib/solana-client";
import { fetchSlashedEvents } from "../lib/events";

function shortAddr(a: string): string {
  return a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—";
}

function relativeTime(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SirenGraveyardSection({ limit = 10 }: { limit?: number } = {}) {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const { data, isLoading } = useSWR(
    ["siren-graveyard", url, limit],
    () => fetchSlashedEvents(url, limit),
    { refreshInterval: 30_000 },
  );

  return (
    <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <h3 className="text-lg font-bold" style={{ color: "var(--gold)" }}>Siren Graveyard</h3>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Recent slash events — funds redistributed to disciplined stakers.</p>
        </div>
        <span className="text-xs" style={{ color: "var(--muted)" }}>Most recent first</span>
      </div>
      {isLoading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Scanning chain…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No slashes recorded yet.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-bold pb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em", borderBottom: "1px solid var(--border)" }}>
            <div className="col-span-3">TIME</div>
            <div className="col-span-4">USER</div>
            <div className="col-span-5 text-right">LOSS (SOL)</div>
          </div>
          {data.map((e) => (
            <div key={e.signature} className="grid grid-cols-12 gap-2 text-xs py-1.5" style={{ color: "var(--foreground)" }}>
              <div className="col-span-3" style={{ color: "var(--muted)" }}>{relativeTime(e.blockTime)}</div>
              <div className="col-span-4 font-mono">{shortAddr(e.owner)}</div>
              <div className="col-span-5 text-right" style={{ color: "#fca5a5" }}>−{(Number(e.principal) / 1e9).toFixed(4)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
