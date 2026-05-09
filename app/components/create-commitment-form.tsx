"use client";

import { useEffect, useMemo, useState } from "react";
import { address, type Address } from "@solana/kit";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useProtocolMetrics } from "../lib/hooks/use-protocol-metrics";
import { useUserCommitments } from "../lib/hooks/use-user-commitments";
import {
  getCreateNoSellInstructionAsync,
  getCreateHoldAboveInstructionAsync,
  getCreateNoTradeWindowInstructionAsync,
  getCreateAgentGuardianInstructionAsync,
} from "../generated/vault";
import { COMMITMENT_TYPES, TYPE_BY_KEY, type CommitmentTypeKey } from "../lib/commitment-types";

const DURATION_PRESETS = [7, 30, 90, 180, 365];

const LAMPORTS_PER_SOL = 1_000_000_000n;

// integer sqrt for u128 (matches on-chain math.rs)
function integerSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("neg");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

export function CreateCommitmentForm() {
  const { signer } = useWallet();
  const walletAddress = signer?.address;
  const { send, isSending } = useSendTransaction();
  const metrics = useProtocolMetrics();
  const userCommits = useUserCommitments(walletAddress);

  const [type, setType] = useState<CommitmentTypeKey>("NoSell");
  const [targetMint, setTargetMint] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [stakeSol, setStakeSol] = useState("0.05");
  const [floorAmount, setFloorAmount] = useState("");
  const [windowStart, setWindowStart] = useState("2");
  const [windowEnd, setWindowEnd] = useState("5");
  const [guardian, setGuardian] = useState("");

  // Derived: weight + share
  const weight = useMemo(() => {
    try {
      const stakeLamports = BigInt(Math.floor(parseFloat(stakeSol) * 1e9));
      const days = BigInt(parseInt(durationDays, 10));
      if (stakeLamports <= 0n || days <= 0n) return 0n;
      return integerSqrt(stakeLamports * days);
    } catch {
      return 0n;
    }
  }, [stakeSol, durationDays]);

  const networkTotal = metrics?.totalWeight ?? 0n;
  const sharePct = useMemo(() => {
    if (networkTotal === 0n) return weight > 0n ? 100 : 0;
    const totalAfter = networkTotal + weight;
    if (totalAfter === 0n) return 0;
    return Number((weight * 10000n) / totalAfter) / 100;
  }, [weight, networkTotal]);

  // Conflict check (FRONTEND.md §11.5.2)
  const conflictMessage = useMemo<string | null>(() => {
    if (!userCommits) return null;
    const has = userCommits;
    if (has.agentGuardian) {
      return "You have an active AgentGuardian. Cancel it before creating any other commitment.";
    }
    if (type === "AgentGuardian" && (has.noSell.length || has.holdAbove.length || has.noTradeWindow.length)) {
      return "AgentGuardian requires no other active commitments. Cancel them first.";
    }
    if (type === "NoSell" || type === "HoldAbove") {
      if (!targetMint) return null;
      const same = (c: { targetMint: string }) => c.targetMint === targetMint;
      const conflictNoSell = has.noSell.find(same);
      const conflictHoldAbove = has.holdAbove.find(same);
      if (type === "NoSell" && conflictNoSell) return "You already have a NoSell on this token.";
      if (type === "HoldAbove" && conflictHoldAbove) return "You already have a HoldAbove on this token.";
      if (type === "HoldAbove" && conflictNoSell) {
        return "NoSell on this token already covers HoldAbove. Cancel NoSell to downgrade.";
      }
    }
    return null;
  }, [userCommits, type, targetMint]);

  // Local time preview for NoTradeWindow
  const windowLocalPreview = useMemo(() => {
    if (type !== "NoTradeWindow") return null;
    const s = parseInt(windowStart, 10);
    const e = parseInt(windowEnd, 10);
    if (isNaN(s) || isNaN(e)) return null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetH = -new Date().getTimezoneOffset() / 60;
    const ls = ((s + offsetH) % 24 + 24) % 24;
    const le = ((e + offsetH) % 24 + 24) % 24;
    return `Local (${tz}): ${String(ls).padStart(2, "0")}:00 → ${String(le).padStart(2, "0")}:00${ls > le ? " (crosses midnight)" : ""}`;
  }, [type, windowStart, windowEnd]);

  const windowInvalid =
    type === "NoTradeWindow" && (windowStart === "" || windowEnd === "" || windowStart === windowEnd);

  const canSubmit = !!signer && !conflictMessage && !isSending && !windowInvalid;

  async function handleSubmit() {
    if (!signer) {
      toast.error("Connect wallet first");
      return;
    }
    try {
      const stakeLamports = BigInt(Math.floor(parseFloat(stakeSol) * 1e9));
      if (stakeLamports < 10_000_000n) throw new Error("Minimum stake is 0.01 SOL");
      const days = parseInt(durationDays, 10);
      if (!days || days < 1 || days > 365) throw new Error("Duration must be 1-365 days");

      let ix;
      switch (type) {
        case "NoSell": {
          if (!targetMint) throw new Error("Target mint required");
          ix = await getCreateNoSellInstructionAsync({
            owner: signer,
            targetMint: address(targetMint),
            stakeAmount: stakeLamports,
            durationDays: days,
          });
          break;
        }
        case "HoldAbove": {
          if (!targetMint) throw new Error("Target mint required");
          const floorBig = BigInt(Math.floor(parseFloat(floorAmount || "0")));
          if (floorBig <= 0n) throw new Error("Floor amount required");
          ix = await getCreateHoldAboveInstructionAsync({
            owner: signer,
            targetMint: address(targetMint),
            stakeAmount: stakeLamports,
            durationDays: days,
            floorAmount: floorBig,
          });
          break;
        }
        case "NoTradeWindow": {
          const sh = parseInt(windowStart, 10);
          const eh = parseInt(windowEnd, 10);
          if (sh < 0 || sh > 23 || eh < 0 || eh > 23) throw new Error("Hours must be 0-23");
          if (sh === eh) throw new Error("Window cannot be 0 hours");
          const nonce = BigInt(Date.now());
          ix = await getCreateNoTradeWindowInstructionAsync({
            owner: signer,
            stakeAmount: stakeLamports,
            durationDays: days,
            windowStartHour: sh,
            windowEndHour: eh,
            nonce,
          });
          break;
        }
        case "AgentGuardian": {
          if (!guardian) throw new Error("Guardian pubkey required");
          ix = await getCreateAgentGuardianInstructionAsync({
            owner: signer,
            stakeAmount: stakeLamports,
            durationDays: days,
            guardianPubkey: address(guardian) as Address,
          });
          break;
        }
      }
      const sig = await send({ instructions: [ix] });
      toast.success(`Commitment created: ${sig.slice(0, 8)}…`);
      userCommits.refresh?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  }

  return (
    <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <h3 className="text-lg font-bold mb-4" style={{ color: "var(--gold)" }}>
        Create Commitment
      </h3>

      {/* Type */}
      <Field label="COMMITMENT TYPE">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CommitmentTypeKey)}
          className="w-full px-3 py-2 rounded"
          style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        >
          {COMMITMENT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.emoji} {t.label} — {t.tagline}</option>
          ))}
        </select>
      </Field>

      {/* Target / per-type fields */}
      {(type === "NoSell" || type === "HoldAbove") && (
        <Field label="TARGET MINT ADDRESS">
          <input
            value={targetMint}
            onChange={(e) => setTargetMint(e.target.value.trim())}
            placeholder="Mint pubkey"
            className="w-full px-3 py-2 rounded font-mono text-sm"
            style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>
      )}
      {type === "HoldAbove" && (
        <Field label="FLOOR AMOUNT (raw token units, must be > 0 and ≤ baseline)">
          <input
            value={floorAmount}
            onChange={(e) => setFloorAmount(e.target.value.trim())}
            placeholder="e.g. 100000"
            className="w-full px-3 py-2 rounded"
            style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>
      )}
      {type === "NoTradeWindow" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="WINDOW START HOUR (UTC, 0-23)">
              <input
                type="number"
                min={0}
                max={23}
                step={1}
                value={windowStart}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  if (v === "") return setWindowStart("");
                  const n = Math.max(0, Math.min(23, parseInt(v, 10)));
                  setWindowStart(String(n));
                }}
                className="w-full px-3 py-2 rounded"
                style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
              />
            </Field>
            <Field label="WINDOW END HOUR (UTC, exclusive, 0-23)">
              <input
                type="number"
                min={0}
                max={23}
                step={1}
                value={windowEnd}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  if (v === "") return setWindowEnd("");
                  const n = Math.max(0, Math.min(23, parseInt(v, 10)));
                  setWindowEnd(String(n));
                }}
                className="w-full px-3 py-2 rounded"
                style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
              />
            </Field>
          </div>
          {windowLocalPreview && (
            <div className="text-xs mb-3" style={{ color: "var(--muted)" }}>{windowLocalPreview}</div>
          )}
          {windowStart !== "" && windowEnd !== "" && windowStart === windowEnd && (
            <div className="text-xs mb-3" style={{ color: "#fca5a5" }}>Window cannot be 0 hours (start = end).</div>
          )}
        </>
      )}
      {type === "AgentGuardian" && (
        <Field label="GUARDIAN PUBKEY (only this key may move funds)">
          <input
            value={guardian}
            onChange={(e) => setGuardian(e.target.value.trim())}
            placeholder="Guardian wallet address"
            className="w-full px-3 py-2 rounded font-mono text-sm"
            style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>
      )}

      {/* Duration */}
      <Field label="DURATION (DAYS)">
        <div className="flex gap-2 mb-2 flex-wrap">
          {DURATION_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDurationDays(String(d))}
              className="px-3 py-1 rounded text-xs"
              style={{
                background: durationDays === String(d) ? "var(--gold)" : "var(--input)",
                color: durationDays === String(d) ? "var(--background)" : "var(--foreground)",
                border: "1px solid var(--border)",
              }}
            >
              {d}d
            </button>
          ))}
          <input
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value.trim())}
            className="flex-1 min-w-[80px] px-3 py-1 rounded text-sm"
            style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </div>
      </Field>

      {/* Stake */}
      <Field label="STAKE AMOUNT (SOL, ≥ 0.01)">
        <input
          value={stakeSol}
          onChange={(e) => setStakeSol(e.target.value.trim())}
          className="w-full px-3 py-2 rounded"
          style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        />
        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          Your weight: <span style={{ color: "var(--gold)" }}>{weight.toString()}</span> · Network total:{" "}
          {networkTotal.toString()} · Your share:{" "}
          <span style={{ color: "var(--gold)" }}>{sharePct.toFixed(2)}%</span>
        </div>
      </Field>

      {conflictMessage && (
        <div className="text-sm mb-3 px-3 py-2 rounded" style={{ background: "rgba(220,38,38,0.1)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.4)" }}>
          ⚠ {conflictMessage}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-2.5 rounded font-bold text-sm transition-opacity"
        style={{
          background: "var(--gold)",
          color: "var(--background)",
          opacity: canSubmit ? 1 : 0.4,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {isSending ? "Submitting…" : "Create Commitment"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] font-bold mb-1.5" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
