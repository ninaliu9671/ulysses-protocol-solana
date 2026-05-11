"use client";

import { useSlashedEvents } from "../lib/hooks/use-slashed-events";
import { TYPE_BY_KEY } from "../lib/commitment-types";
import type { SlashedEvent } from "../lib/events";
import { lamportsToDisplaySol } from "../lib/lamports";

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

function progressPct(e: SlashedEvent): string {
  if (e.createdAt == null || e.expiresAt == null || e.blockTime == null) return "—";
  const total = e.expiresAt - e.createdAt;
  if (total <= 0) return "—";
  const elapsed = e.blockTime - e.createdAt;
  const pct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  return `${pct.toFixed(0)}%`;
}

export function SirenGraveyardSection({ limit = 10 }: { limit?: number } = {}) {
  const { events: data, isLoading } = useSlashedEvents(limit);

  return (
    <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <h3 className="text-lg font-bold" style={{ color: "var(--gold)" }}>Siren Graveyard</h3>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Failed + cancelled commitments — funds redistributed to disciplined stakers.</p>
        </div>
        <span className="text-xs" style={{ color: "var(--muted)" }}>Most recent first</span>
      </div>
      {isLoading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Scanning chain…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No failed or cancelled commitments yet.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-bold pb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em", borderBottom: "1px solid var(--border)" }}>
            <div className="col-span-2">TIME</div>
            <div className="col-span-2">USER</div>
            <div className="col-span-2">TYPE</div>
            <div className="col-span-2">STATUS</div>
            <div className="col-span-2 text-center">PROGRESS</div>
            <div className="col-span-2 text-right">LOSS (SOL)</div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: "420px" }}>
          {data.map((e) => {
            const meta = e.commitmentType !== "Unknown" ? TYPE_BY_KEY[e.commitmentType] : null;
            const isFailed = e.kind === "Slashed";
            return (
              <div key={e.signature} className="grid grid-cols-12 gap-2 text-xs py-1.5" style={{ color: "var(--foreground)" }}>
                <div className="col-span-2" style={{ color: "var(--muted)" }}>{relativeTime(e.blockTime)}</div>
                <div className="col-span-2 font-mono">{shortAddr(e.owner)}</div>
                <div className="col-span-2 flex items-center gap-1.5">
                  {meta ? (
                    <>
                      <span className="text-sm">{meta.emoji}</span>
                      <span>{meta.label}</span>
                    </>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </div>
                <div className="col-span-2">
                  <span style={{ color: isFailed ? "#fca5a5" : "#9ca3af", fontSize: 10 }}>
                    {isFailed ? "💀 Failed" : "⚫ Cancelled"}
                  </span>
                </div>
                <div className="col-span-2 text-center" style={{ color: "var(--muted)" }}>{progressPct(e)}</div>
                <div className="col-span-2 text-right tabular-nums" style={{ color: "#fca5a5" }}>−{lamportsToDisplaySol(e.principal, 2)}</div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
