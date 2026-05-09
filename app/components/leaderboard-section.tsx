"use client";

import { useMemo } from "react";
import { useAllCommitments, type AllCommitment } from "../lib/hooks/use-all-commitments";
import { useProtocolMetrics } from "../lib/hooks/use-protocol-metrics";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const PRECISION = 1_000_000_000n;

type Row = {
  rank: number;
  owner: string;
  typeMix: string;
  cumulativeStakeSol: number;
  totalYieldSol: number;
  roiPct: number;
};

function shortAddr(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function LeaderboardSection({ limit }: { limit?: number } = {}) {
  const all = useAllCommitments();
  const metrics = useProtocolMetrics();

  const rows = useMemo<Row[]>(() => {
    if (!all || !metrics) return [];
    const acc = metrics.accRewardPerWeight;

    const groups = new Map<string, { items: AllCommitment[]; stake: bigint; yieldL: bigint }>();
    for (const c of all) {
      const g = groups.get(c.owner) ?? { items: [], stake: 0n, yieldL: 0n };
      g.items.push(c);
      g.stake += c.stakeAmount;
      const accumulated = (c.weight * acc) / PRECISION;
      const debt = c.rewardDebt / PRECISION;
      g.yieldL += accumulated > debt ? accumulated - debt : 0n;
      groups.set(c.owner, g);
    }

    const arr = Array.from(groups.entries())
      .map(([owner, g]) => {
        const types = Array.from(new Set(g.items.map((i) => i.type[0]))).sort().join("");
        return {
          owner,
          typeMix: types,
          cumulativeStakeSol: Number(g.stake) / 1e9,
          totalYieldSol: Number(g.yieldL) / 1e9,
          roiPct: g.stake > 0n ? (Number(g.yieldL) / Number(g.stake)) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalYieldSol - a.totalYieldSol);

    return arr.map((r, i) => ({ rank: i + 1, ...r })).slice(0, limit ?? arr.length);
  }, [all, metrics, limit]);

  return (
    <div id="leaderboard" className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="text-lg font-bold" style={{ color: "var(--gold)" }}>Hall of Masts</h3>
        <span className="text-xs" style={{ color: "var(--muted)" }}>Top by yield</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No commitments yet.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-bold pb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em", borderBottom: "1px solid var(--border)" }}>
            <div className="col-span-1">RANK</div>
            <div className="col-span-3">USER</div>
            <div className="col-span-2">MIX</div>
            <div className="col-span-2 text-right">STAKED</div>
            <div className="col-span-2 text-right">YIELD</div>
            <div className="col-span-2 text-right">ROI</div>
          </div>
          {rows.map((r) => (
            <div key={r.owner} className="grid grid-cols-12 gap-2 text-sm py-1.5" style={{ color: "var(--foreground)" }}>
              <div className="col-span-1">{MEDAL[r.rank] ?? r.rank}</div>
              <div className="col-span-3 font-mono text-xs">{shortAddr(r.owner)}</div>
              <div className="col-span-2 text-xs" style={{ color: "var(--muted)" }}>{r.typeMix}</div>
              <div className="col-span-2 text-right text-xs">{r.cumulativeStakeSol.toFixed(3)}</div>
              <div className="col-span-2 text-right text-xs" style={{ color: "var(--gold)" }}>+{r.totalYieldSol.toFixed(6)}</div>
              <div className="col-span-2 text-right text-xs" style={{ color: "var(--gold)" }}>{r.roiPct.toFixed(2)}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
