"use client";

import { useMemo } from "react";
import { useAllCommitments, type AllCommitment } from "../lib/hooks/use-all-commitments";
import { useProtocolMetrics } from "../lib/hooks/use-protocol-metrics";
import { useClaimedEvents } from "../lib/hooks/use-claimed-events";
import { COMMITMENT_TYPES, TYPE_BY_KEY } from "../lib/commitment-types";
import { DEMO_MULTIPLIER } from "../lib/lamports";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const PRECISION = 1_000_000_000n;

type Row = {
  rank: number;
  owner: string;
  typeEmojis: string;
  liveStakeSol: number;
  earnedSol: number;
  pendingSol: number;
  totalYieldSol: number;
  roiPct: number;
};

function shortAddr(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

export function LeaderboardSection({ limit }: { limit?: number } = {}) {
  const all = useAllCommitments();
  const metrics = useProtocolMetrics();
  const claimedEvents = useClaimedEvents();

  const rows = useMemo<Row[]>(() => {
    if (!all || !metrics) return [];
    const acc = metrics.accRewardPerWeight;
    const now = BigInt(Math.floor(Date.now() / 1000));

    type GroupData = {
      items: AllCommitment[];
      liveStake: bigint;
      claimableYield: bigint;
      pendingYield: bigint;
      claimedYield: bigint;
    };
    const groups = new Map<string, GroupData>();

    for (const c of all) {
      const g = groups.get(c.owner) ?? { items: [], liveStake: 0n, claimableYield: 0n, pendingYield: 0n, claimedYield: 0n };
      g.items.push(c);
      g.liveStake += c.stakeAmount;
      const pendingL = (c.weight * acc) / PRECISION;
      const yieldL = pendingL > c.rewardDebt ? pendingL - c.rewardDebt : 0n;
      if (now >= c.expiresAt) g.claimableYield += yieldL;
      else g.pendingYield += yieldL;
      groups.set(c.owner, g);
    }

    for (const e of claimedEvents ?? []) {
      const g = groups.get(e.owner) ?? { items: [], liveStake: 0n, claimableYield: 0n, pendingYield: 0n, claimedYield: 0n };
      g.claimedYield += e.yieldPaid;
      groups.set(e.owner, g);
    }

    const arr = Array.from(groups.entries())
      .map(([owner, g]) => {
        const earnedSol = Number(g.claimedYield + g.claimableYield) / 1e9 * DEMO_MULTIPLIER;
        const pendingSol = Number(g.pendingYield) / 1e9 * DEMO_MULTIPLIER;
        const totalYieldSol = earnedSol + pendingSol;
        const liveStakeSol = Number(g.liveStake) / 1e9 * DEMO_MULTIPLIER;
        const roiPct = liveStakeSol > 0 ? (totalYieldSol / liveStakeSol) * 100 : 0;
        const uniqueTypes = Array.from(new Set(g.items.map((i) => i.type)));
        uniqueTypes.sort((a, b) =>
          COMMITMENT_TYPES.findIndex((t) => t.key === a) -
          COMMITMENT_TYPES.findIndex((t) => t.key === b),
        );
        return {
          owner,
          typeEmojis: uniqueTypes.map((k) => TYPE_BY_KEY[k].emoji).join(" "),
          liveStakeSol,
          earnedSol,
          pendingSol,
          totalYieldSol,
          roiPct,
        };
      })
      .sort((a, b) => b.totalYieldSol - a.totalYieldSol);

    return arr.map((r, i) => ({ rank: i + 1, ...r })).slice(0, limit ?? arr.length);
  }, [all, metrics, claimedEvents, limit]);

  return (
    <div id="leaderboard" className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <h3 className="text-lg font-bold" style={{ color: "var(--gold)" }}>Hall of Masts</h3>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>Stakers ranked by total yield — earned (claimed + claimable) and pending.</p>
        </div>
        <span className="text-xs" style={{ color: "var(--muted)" }}>Top by total yield</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No commitments yet.</p>
      ) : (
        <div className="overflow-hidden">
          <div className="grid grid-cols-12 gap-1 text-[10px] font-bold pb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em", borderBottom: "1px solid var(--border)" }}>
            <div className="col-span-1 min-w-0">RANK</div>
            <div className="col-span-2 min-w-0">USER</div>
            <div className="col-span-1 text-right min-w-0">STAKED</div>
            <div className="col-span-2 text-right min-w-0">EARNED</div>
            <div className="col-span-2 text-right min-w-0">PENDING</div>
            <div className="col-span-2 text-right min-w-0">TOTAL</div>
            <div className="col-span-2 text-right min-w-0">ROI</div>
          </div>
          <div className="space-y-0 overflow-y-auto" style={{ maxHeight: "420px" }}>
            {rows.map((r) => (
              <div key={r.owner} className="grid grid-cols-12 gap-1 text-xs py-1.5" style={{ color: "var(--foreground)" }}>
                <div className="col-span-1 min-w-0">{MEDAL[r.rank] ?? r.rank}</div>
                <div className="col-span-2 min-w-0 font-mono truncate">{shortAddr(r.owner)}</div>
                <div className="col-span-1 text-right min-w-0 tabular-nums" style={{ color: "var(--foreground)" }}>
                  {r.liveStakeSol > 0 ? r.liveStakeSol.toFixed(2) : <span style={{ color: "var(--muted)" }}>—</span>}
                </div>
                <div className="col-span-2 text-right min-w-0 tabular-nums" style={{ color: r.earnedSol > 0 ? "var(--gold)" : "var(--muted)" }}>
                  {r.earnedSol > 0 ? `+${r.earnedSol.toFixed(2)}` : "—"}
                </div>
                <div className="col-span-2 text-right min-w-0 tabular-nums" style={{ color: r.pendingSol > 0 ? "#86efac" : "var(--muted)" }}>
                  {r.pendingSol > 0 ? `+${r.pendingSol.toFixed(2)}` : "—"}
                </div>
                <div className="col-span-2 text-right min-w-0 tabular-nums" style={{ color: "var(--gold)" }}>+{r.totalYieldSol.toFixed(2)}</div>
                <div className="col-span-2 text-right min-w-0 tabular-nums" style={{ color: "var(--gold)" }}>{r.roiPct.toFixed(2)}%</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px]" style={{ color: "var(--muted)", borderTop: "1px solid var(--border)", letterSpacing: "0.05em" }}>
            {COMMITMENT_TYPES.map((t) => (
              <span key={t.key} className="flex items-center gap-1">
                <span className="text-sm">{t.emoji}</span>
                <span>{t.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
