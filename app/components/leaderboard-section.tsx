"use client";

import useSWR from "swr";
import {
  fetchWatcherCommitments,
  parseCommitmentType,
  shortAddr,
  lamportsToSol,
} from "../lib/watcher";

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function LeaderboardSection() {
  const { data: commitments, isLoading } = useSWR(
    "watcher-commitments-lb",
    fetchWatcherCommitments,
    { refreshInterval: 60_000 }
  );

  // Sort by stake_amount descending, take top 10
  const ranked = (commitments ?? [])
    .slice()
    .sort((a, b) => Number(BigInt(b.stake_amount) - BigInt(a.stake_amount)))
    .slice(0, 10)
    .map((c, i) => ({
      rank: i + 1,
      wallet: shortAddr(c.owner),
      mint: shortAddr(c.target_mint),
      type: parseCommitmentType(c.commitment_type).type,
      stakeSOL: lamportsToSol(c.stake_amount),
    }));

  return (
    <div id="leaderboard" className="card-ulysses p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: "1px solid var(--border-low)" }}>
        <div className="flex items-center gap-2">
          <TrophyIcon />
          <span className="section-label">Discipline Leaderboard</span>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>Ranked by stake</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading…</p>
        </div>
      ) : ranked.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>No active commitments yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["#", "WALLET", "MINT", "TYPE", "STAKED"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      color: "var(--muted)",
                      textAlign: h === "#" ? "center" : "left",
                      padding: "0 4px 10px",
                      textTransform: "uppercase",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((row) => (
                <tr key={row.rank} style={{ borderTop: "1px solid var(--border-low)" }}>
                  <td style={{ padding: "10px 4px", textAlign: "center", fontSize: 14 }}>
                    {MEDAL[row.rank] ?? (
                      <span style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{row.rank}</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 4px" }}>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--foreground)" }}>
                      {row.wallet}
                    </span>
                  </td>
                  <td style={{ padding: "10px 4px" }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "var(--muted)" }}>
                      {row.mint}
                    </span>
                  </td>
                  <td style={{ padding: "10px 4px" }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--gold)",
                        background: "var(--gold-dim)",
                        border: "1px solid var(--border)",
                        padding: "1px 6px",
                        borderRadius: 3,
                      }}
                    >
                      {row.type}
                    </span>
                  </td>
                  <td style={{ padding: "10px 4px" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--yield-green)" }}>
                      {row.stakeSOL.toFixed(4)} SOL
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  );
}
