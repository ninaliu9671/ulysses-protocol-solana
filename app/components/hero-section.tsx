"use client";

import useSWR from "swr";
import {
  fetchWatcherCommitments,
  fetchWatcherHistory,
  lamportsToSol,
} from "../lib/watcher";

export function HeroSection() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ paddingTop: 72 }}
    >
      {/* Background image — right side only */}
      <div
        className="absolute top-0 bottom-0 right-0 pointer-events-none"
        style={{ width: "62%" }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url('/ulysses-bg.png')",
            backgroundSize: "cover",
            backgroundPosition: "center center",
            backgroundRepeat: "no-repeat",
          }}
        />
        {/* Fade left edge into dark background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, #0c0b09 0%, rgba(12,11,9,0.55) 22%, rgba(12,11,9,0.1) 50%, transparent 100%)",
          }}
        />
      </div>
      {/* Bottom gradient */}
      <div
        className="absolute bottom-0 left-0 right-0 h-48 pointer-events-none"
        style={{
          background: "linear-gradient(to bottom, transparent, #0c0b09)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-8 py-24">
        <div className="max-w-xl">
          {/* Badge */}
          <div className="flex items-center gap-2 mb-6">
            <span style={{ color: "var(--gold)", fontSize: 11 }}>+</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: "var(--gold)",
                textTransform: "uppercase",
              }}
            >
              Turn Discipline Into Yield
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: "clamp(2.6rem, 5vw, 4rem)",
              fontWeight: 900,
              lineHeight: 1.08,
              color: "var(--foreground)",
              marginBottom: "1.5rem",
            }}
          >
            Bind yourself
            <br />
            before temptation
            <br />
            arrives.
          </h1>

          {/* Description */}
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.8,
              color: "var(--muted)",
              maxWidth: 420,
              marginBottom: "2rem",
            }}
          >
            Stake tokens. Commit to not buying a specific token for a period of
            time. If you break your vow, you get slashed. If you stay
            disciplined, you earn yield from others&apos; failures.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-3">
            <a
              href="#commitment"
              className="flex items-center gap-2 px-6 py-3 rounded font-semibold text-sm transition-opacity hover:opacity-90"
              style={{
                background: "var(--gold)",
                color: "#0c0b09",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <AnchorIcon />
              Make a Commitment
            </a>
            <a
              href="#how-it-works"
              className="flex items-center gap-2 px-6 py-3 rounded font-semibold text-sm transition-opacity hover:opacity-80"
              style={{
                border: "1px solid var(--border-strong)",
                color: "var(--foreground)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <PlayIcon />
              Watch Demo
            </a>
          </div>
        </div>

      </div>

      {/* Stats bar */}
      <StatsBar />
    </section>
  );
}

function StatsBar() {
  const { data: commitments } = useSWR("watcher-commitments-hero", fetchWatcherCommitments, { refreshInterval: 60_000 });
  const { data: history } = useSWR("watcher-history-hero", fetchWatcherHistory, { refreshInterval: 60_000 });

  const tvl = commitments
    ? commitments.reduce((sum, c) => sum + lamportsToSol(c.stake_amount), 0).toFixed(2) + " SOL"
    : "—";
  const activeCount = commitments ? commitments.length.toString() : "—";
  const totalRewards = history
    ? history.reduce((sum, s) => sum + lamportsToSol(s.amount), 0).toFixed(2) + " SOL"
    : "—";

  const stats = [
    { icon: <VaultIcon />, value: tvl, label: "Total Value Locked" },
    { icon: <CommitmentsIcon />, value: activeCount, label: "Active Commitments" },
    { icon: <RewardIcon />, value: totalRewards, label: "Total Rewards Paid" },
  ];

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-10"
      style={{
        borderTop: "1px solid var(--border)",
        background: "rgba(12,11,9,0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div className="max-w-7xl mx-auto px-8 py-4 flex flex-wrap items-center gap-6">
        {stats.map((s, i) => (
          <div key={i} className="flex items-center gap-3">
            {i > 0 && (
              <div style={{ width: 1, height: 28, background: "var(--border)" }} />
            )}
            <div className="flex items-center gap-2.5">
              <div style={{ color: "var(--gold)", opacity: 0.7 }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--gold)" }}>{s.value}</div>
                <div style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>{s.label}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnchorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3" />
      <line x1="12" y1="8" x2="12" y2="22" />
      <path d="M5 15H2a10 10 0 0 0 20 0h-3" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  );
}

function VaultIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="12" cy="12" r="4" />
      <line x1="16" y1="8" x2="18" y2="6" />
    </svg>
  );
}

function CommitmentsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function RewardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="6" />
      <path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" />
    </svg>
  );
}

