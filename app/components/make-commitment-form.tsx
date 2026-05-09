"use client";

import { useState, useMemo } from "react";
import { useWallet } from "../lib/wallet/context";

type CommitmentTypeKey =
  | "NoBuy"
  | "NoSell"
  | "HoldAbove"
  | "HoldUntil"
  | "NoTradeWindow"
  | "AgentGuardian";

const COMMITMENT_TYPES: { key: CommitmentTypeKey; label: string; desc: string }[] = [
  { key: "NoBuy", label: "NoBuy", desc: "Commit to NOT buying a specific token" },
  { key: "NoSell", label: "NoSell", desc: "Commit to NOT selling a specific token" },
  { key: "HoldAbove", label: "HoldAbove", desc: "Keep your balance above a minimum threshold" },
  { key: "HoldUntil", label: "HoldUntil", desc: "Hold without reducing until a specific date" },
  { key: "NoTradeWindow", label: "NoTradeWindow", desc: "No trades during a daily time window (UTC)" },
  { key: "AgentGuardian", label: "AgentGuardian", desc: "Only your AI agent wallet may trade this token" },
];

const DURATIONS = [
  { label: "24h", seconds: 86400 },
  { label: "72h", seconds: 259200 },
  { label: "7d", seconds: 604800 },
  { label: "3d (Max Weight)", seconds: 259200, maxWeight: true },
];

const TARGET_LABEL: Record<CommitmentTypeKey, string> = {
  NoBuy: "Token to Avoid Buying",
  NoSell: "Token to Avoid Selling",
  HoldAbove: "Token to Hold",
  HoldUntil: "Token to Hold",
  NoTradeWindow: "Token to Restrict Trading",
  AgentGuardian: "Token to Guard",
};

export function MakeCommitmentForm() {
  const { status } = useWallet();

  const [stakeSOL, setStakeSOL] = useState("10");
  const [commitmentType, setCommitmentType] = useState<CommitmentTypeKey>("NoBuy");
  const [targetMint, setTargetMint] = useState("");
  const [durationIdx, setDurationIdx] = useState(1); // 72h default
  const [threshold, setThreshold] = useState("");
  const [unlockDate, setUnlockDate] = useState("");
  const [startHour, setStartHour] = useState("9");
  const [endHour, setEndHour] = useState("17");
  const [guardianPubkey, setGuardianPubkey] = useState("");

  const weight = useMemo(() => {
    const sol = parseFloat(stakeSOL) || 0;
    const dSecs = DURATIONS[durationIdx]?.seconds ?? 259200;
    const dDays = Math.min(dSecs / 86400, 3);
    return (Math.sqrt(sol) * dDays).toFixed(2);
  }, [stakeSOL, durationIdx]);

  const handleSeal = () => {
    if (status !== "connected") {
      alert("Please connect your wallet first.");
      return;
    }
    alert("Demo mode — contract integration coming soon.");
  };

  return (
    <div id="commitment" className="card-ulysses p-6 flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: "1px solid var(--border-low)" }}>
        <div className="flex items-center gap-2">
          <AnchorIcon />
          <span className="section-label">Make a Commitment</span>
        </div>
      </div>

      {/* 1. Stake Amount */}
      <div className="flex flex-col gap-2">
        <label className="section-label text-xs" style={{ color: "var(--muted)", fontSize: 10 }}>
          1. STAKE AMOUNT
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={stakeSOL}
            onChange={(e) => setStakeSOL(e.target.value)}
            className="flex-1 rounded px-3 py-2.5 text-sm font-mono outline-none"
            style={{
              background: "var(--input)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
            placeholder="e.g. 10"
          />
          <div
            className="flex items-center gap-1.5 px-3 py-2.5 rounded text-sm font-semibold"
            style={{
              background: "var(--gold-dim)",
              border: "1px solid var(--border)",
              color: "var(--gold)",
              whiteSpace: "nowrap",
            }}
          >
            <SolanaIcon />
            SOL
          </div>
        </div>
      </div>

      {/* 2. Commitment Type */}
      <div className="flex flex-col gap-2">
        <label className="section-label text-xs" style={{ color: "var(--muted)", fontSize: 10 }}>
          2. COMMITMENT TYPE
        </label>
        <div className="relative">
          <select
            value={commitmentType}
            onChange={(e) => setCommitmentType(e.target.value as CommitmentTypeKey)}
            className="w-full rounded px-3 py-2.5 text-sm outline-none appearance-none"
            style={{
              background: "var(--input)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
              cursor: "pointer",
            }}
          >
            {COMMITMENT_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} — {t.desc}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--gold)" }}>
            <ChevronIcon />
          </div>
        </div>
      </div>

      {/* 3. Target Token */}
      <div className="flex flex-col gap-2">
        <label className="section-label text-xs" style={{ color: "var(--muted)", fontSize: 10 }}>
          3. {TARGET_LABEL[commitmentType].toUpperCase()}
        </label>
        <input
          type="text"
          value={targetMint}
          onChange={(e) => setTargetMint(e.target.value)}
          className="w-full rounded px-3 py-2.5 text-sm font-mono outline-none"
          style={{
            background: "var(--input)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
          placeholder="Token mint address (e.g. DezX...BONK)"
        />
      </div>

      {/* Conditional fields */}
      {commitmentType === "HoldAbove" && (
        <div className="flex flex-col gap-2">
          <label className="section-label text-xs" style={{ color: "var(--muted)", fontSize: 10 }}>
            MINIMUM BALANCE (SOL)
          </label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-full rounded px-3 py-2.5 text-sm font-mono outline-none"
            style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}
            placeholder="e.g. 1.0"
          />
        </div>
      )}

      {commitmentType === "HoldUntil" && (
        <div className="flex flex-col gap-2">
          <label className="section-label text-xs" style={{ color: "var(--muted)", fontSize: 10 }}>
            HOLD UNTIL DATE &amp; TIME
          </label>
          <input
            type="datetime-local"
            value={unlockDate}
            onChange={(e) => setUnlockDate(e.target.value)}
            className="w-full rounded px-3 py-2.5 text-sm outline-none"
            style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}
          />
        </div>
      )}

      {commitmentType === "NoTradeWindow" && (
        <div className="flex flex-col gap-2">
          <label className="section-label text-xs" style={{ color: "var(--muted)", fontSize: 10 }}>
            NO-TRADE WINDOW (UTC HOURS)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="23"
              value={startHour}
              onChange={(e) => setStartHour(e.target.value)}
              className="flex-1 rounded px-3 py-2.5 text-sm font-mono outline-none text-center"
              style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              placeholder="Start (0-23)"
            />
            <span style={{ color: "var(--muted)", fontSize: 12 }}>to</span>
            <input
              type="number"
              min="0"
              max="23"
              value={endHour}
              onChange={(e) => setEndHour(e.target.value)}
              className="flex-1 rounded px-3 py-2.5 text-sm font-mono outline-none text-center"
              style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}
              placeholder="End (0-23)"
            />
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)" }}>
            Trades involving this token during {startHour}:00–{endHour}:00 UTC will trigger a slash.
          </p>
        </div>
      )}

      {commitmentType === "AgentGuardian" && (
        <div className="flex flex-col gap-2">
          <label className="section-label text-xs" style={{ color: "var(--muted)", fontSize: 10 }}>
            AGENT WALLET ADDRESS
          </label>
          <input
            type="text"
            value={guardianPubkey}
            onChange={(e) => setGuardianPubkey(e.target.value)}
            className="w-full rounded px-3 py-2.5 text-sm font-mono outline-none"
            style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}
            placeholder="Agent pubkey allowed to trade on your behalf"
          />
          <p style={{ fontSize: 11, color: "var(--muted)" }}>
            Any trade NOT signed by this agent will trigger a slash.
          </p>
        </div>
      )}

      {/* 4. Duration */}
      <div className="flex flex-col gap-2">
        <label className="section-label text-xs" style={{ color: "var(--muted)", fontSize: 10 }}>
          4. DURATION
        </label>
        <div className="flex gap-2">
          {DURATIONS.map((d, i) => (
            <button
              key={i}
              onClick={() => setDurationIdx(i)}
              className="flex-1 rounded py-2 text-xs font-semibold transition-all"
              style={{
                background: durationIdx === i ? "var(--gold)" : "var(--input)",
                color: durationIdx === i ? "#0c0b09" : "var(--muted)",
                border: `1px solid ${durationIdx === i ? "var(--gold)" : "var(--border)"}`,
                fontSize: 11,
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Weight display */}
      <div
        className="rounded p-4 flex items-center justify-between"
        style={{ background: "var(--gold-dim)", border: "1px solid var(--border)" }}
      >
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Commitment Weight
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            √(stake) × min(T, 3 days) — more stake &amp; time = more yield share
          </div>
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--gold)", fontFamily: "var(--font-mono)" }}>
          {weight}
        </div>
      </div>

      {/* x402 notice */}
      <div
        className="rounded p-3 text-xs"
        style={{ background: "rgba(201,169,110,0.06)", border: "1px solid var(--border-low)" }}
      >
        <span style={{ color: "var(--foreground)", fontWeight: 600 }}>x402 activation fee:</span>{" "}
        <span style={{ color: "var(--muted)" }}>
          Creating a commitment costs <strong style={{ color: "var(--gold)" }}>0.001 SOL</strong> paid to the protocol treasury, verified before the on-chain instruction is authorised.
        </span>
      </div>

      {/* Seal button */}
      <button
        onClick={handleSeal}
        className="w-full rounded py-3.5 font-bold text-sm flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
        style={{
          background: "var(--gold)",
          color: "#0c0b09",
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.05em",
        }}
      >
        <AnchorIcon />
        SEAL COMMITMENT
      </button>
      <p className="text-center" style={{ fontSize: 11, color: "var(--muted)" }}>
        You can&apos;t edit or cancel once sealed.
      </p>
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

function SolanaIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.9 15.9L6.5 13h14.1c.3 0 .5.4.3.6l-2.6 2.9c-.1.1-.2.1-.3.1H4.2c-.3 0-.5-.3-.3-.7z" />
      <path d="M3.9 8.1L6.5 11h14.1c.3 0 .5-.4.3-.6L18.3 7.5c-.1-.1-.2-.1-.3-.1H4.2c-.3 0-.5.3-.3.7z" opacity="0.7" />
      <path d="M6.5 17.5 3.9 20.4c-.2.2 0 .6.3.6h14.1c.1 0 .2 0 .3-.1l2.6-2.9c.2-.2 0-.6-.3-.6H6.8c-.1 0-.2 0-.3.1z" opacity="0.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
