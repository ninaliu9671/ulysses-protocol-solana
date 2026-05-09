"use client";

import useSWR from "swr";
import {
  fetchWatcherHistory,
  shortAddr,
  lamportsToSol,
  timeAgo,
  parseCommitmentType,
  fetchWatcherCommitments,
  type WatcherSlashEvent,
} from "../lib/watcher";

// Enrich slash events with commitment_type from commitments table
async function fetchSlashesWithType() {
  const [history, commitments] = await Promise.all([
    fetchWatcherHistory(),
    fetchWatcherCommitments(),
  ]);
  const typeMap = new Map(commitments.map((c) => [c.pubkey, c.commitment_type]));
  return history.slice(0, 10).map((s) => ({
    ...s,
    commitmentTypeRaw: typeMap.get(s.pubkey) ?? '{"type":"Unknown"}',
  }));
}

export function SirenGraveyardSection() {
  const { data: slashes, isLoading } = useSWR(
    "watcher-history",
    fetchSlashesWithType,
    { refreshInterval: 30_000 }
  );

  return (
    <div className="card-ulysses p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: "1px solid rgba(239,68,68,0.2)" }}>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: "#ef4444", boxShadow: "0 0 6px #ef4444" }}
          />
          <span className="section-label" style={{ color: "#ef4444" }}>
            Siren Graveyard
          </span>
        </div>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>Those who broke their vow.</span>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading slash history…</p>
        </div>
      ) : !slashes || slashes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            No slashes yet.
            <br />
            <span style={{ fontSize: 11 }}>Compliant stakers earn yield when someone breaks their vow.</span>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {slashes.map((s) => {
            const ct = parseCommitmentType(s.commitmentTypeRaw);
            return (
              <div
                key={s.id}
                className="rounded p-4"
                style={{
                  background: "rgba(239,68,68,0.04)",
                  border: "1px solid rgba(239,68,68,0.12)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-full mt-0.5 flex-shrink-0"
                      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
                    >
                      <SkullIcon />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--foreground)", fontWeight: 600 }}>
                          {shortAddr(s.owner)}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>
                          violated{" "}
                          <span style={{ color: "#ef4444", fontWeight: 700 }}>{ct.type}</span>
                        </span>
                        <span className="badge-slashed">SLASHED</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, fontFamily: "monospace" }}>
                        {shortAddr(s.target_mint)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#ef4444" }}>
                      −{lamportsToSol(s.amount).toFixed(4)} SOL
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                      {timeAgo(s.slashed_at)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SkullIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a9 9 0 0 1 9 9c0 3.18-1.65 5.97-4.13 7.58L16 22H8l-.87-3.42A9 9 0 0 1 12 2z" />
      <path d="M9 17v1" />
      <path d="M15 17v1" />
      <circle cx="9" cy="12" r="1.5" fill="#ef4444" stroke="none" />
      <circle cx="15" cy="12" r="1.5" fill="#ef4444" stroke="none" />
    </svg>
  );
}
