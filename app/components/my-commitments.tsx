"use client";

import { useMemo, useState } from "react";
import { address } from "@solana/kit";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useUserCommitments } from "../lib/hooks/use-user-commitments";
import { useProtocolMetrics } from "../lib/hooks/use-protocol-metrics";
import {
  getClaimNoSellInstructionAsync,
  getClaimHoldAboveInstructionAsync,
  getClaimNoTradeWindowInstructionAsync,
  getClaimAgentGuardianInstructionAsync,
  getCancelNoSellInstructionAsync,
  getCancelHoldAboveInstructionAsync,
  getCancelNoTradeWindowInstructionAsync,
  getCancelAgentGuardianInstructionAsync,
} from "../generated/vault";

const PRECISION = 1_000_000_000n;

type Row = {
  pubkey: string;
  type: "NoSell" | "HoldAbove" | "NoTradeWindow" | "AgentGuardian";
  label: string;
  stakeAmount: bigint;
  weight: bigint;
  rewardDebt: bigint;
  createdAt: bigint;
  expiresAt: bigint;
};

export function MyCommitmentsSection() {
  const { signer } = useWallet();
  const { send, isSending } = useSendTransaction();
  const owner = signer?.address;
  const userCommits = useUserCommitments(owner);
  const metrics = useProtocolMetrics();
  const [confirmCancelPubkey, setConfirmCancelPubkey] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState("");

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    for (const c of userCommits.noSell) {
      out.push({ pubkey: c.pubkey, type: "NoSell", label: `NoSell · ${c.targetMint.slice(0, 4)}…${c.targetMint.slice(-4)}`, stakeAmount: c.stakeAmount, weight: c.weight, rewardDebt: c.rewardDebt, createdAt: c.createdAt, expiresAt: c.expiresAt });
    }
    for (const c of userCommits.holdAbove) {
      out.push({ pubkey: c.pubkey, type: "HoldAbove", label: `HoldAbove · ${c.targetMint.slice(0, 4)}…${c.targetMint.slice(-4)} ≥ ${c.floorAmount}`, stakeAmount: c.stakeAmount, weight: c.weight, rewardDebt: c.rewardDebt, createdAt: c.createdAt, expiresAt: c.expiresAt });
    }
    for (const c of userCommits.noTradeWindow) {
      out.push({ pubkey: c.pubkey, type: "NoTradeWindow", label: `NoTradeWindow · ${String(c.windowStartHour).padStart(2, "0")}:00→${String(c.windowEndHour).padStart(2, "0")}:00 UTC`, stakeAmount: c.stakeAmount, weight: c.weight, rewardDebt: c.rewardDebt, createdAt: c.createdAt, expiresAt: c.expiresAt });
    }
    if (userCommits.agentGuardian) {
      const c = userCommits.agentGuardian;
      out.push({ pubkey: c.pubkey, type: "AgentGuardian", label: `AgentGuardian · ${c.guardianPubkey.slice(0, 4)}…${c.guardianPubkey.slice(-4)}`, stakeAmount: c.stakeAmount, weight: c.weight, rewardDebt: c.rewardDebt, createdAt: c.createdAt, expiresAt: c.expiresAt });
    }
    return out.sort((a, b) => Number(b.createdAt - a.createdAt));
  }, [userCommits]);

  function pendingYield(row: Row): bigint {
    if (!metrics) return 0n;
    const accumulated = (row.weight * metrics.accRewardPerWeight) / PRECISION;
    const debt = row.rewardDebt / PRECISION;
    return accumulated > debt ? accumulated - debt : 0n;
  }

  function progressPct(row: Row): number {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const total = row.expiresAt - row.createdAt;
    if (total <= 0n) return 0;
    const elapsed = now - row.createdAt;
    if (elapsed <= 0n) return 0;
    return Number((elapsed * 1000n) / total) / 10;
  }

  function isUnlockable(row: Row): boolean {
    return BigInt(Math.floor(Date.now() / 1000)) >= row.expiresAt;
  }

  async function handleClaim(row: Row) {
    if (!signer) return;
    try {
      const commitmentAddr = address(row.pubkey);
      let ix;
      if (row.type === "NoSell") ix = await getClaimNoSellInstructionAsync({ owner: signer, commitment: commitmentAddr });
      else if (row.type === "HoldAbove") ix = await getClaimHoldAboveInstructionAsync({ owner: signer, commitment: commitmentAddr });
      else if (row.type === "NoTradeWindow") ix = await getClaimNoTradeWindowInstructionAsync({ owner: signer, commitment: commitmentAddr });
      else ix = await getClaimAgentGuardianInstructionAsync({ owner: signer });
      const sig = await send({ instructions: [ix] });
      toast.success(`Claimed: ${sig.slice(0, 8)}…`);
      userCommits.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCancelConfirm(row: Row) {
    if (!signer) return;
    if (!metrics?.treasury) {
      toast.error("Treasury not loaded yet");
      return;
    }
    try {
      const commitmentAddr = address(row.pubkey);
      const treasury = address(metrics.treasury);
      let ix;
      if (row.type === "NoSell") ix = await getCancelNoSellInstructionAsync({ owner: signer, commitment: commitmentAddr, treasury });
      else if (row.type === "HoldAbove") ix = await getCancelHoldAboveInstructionAsync({ owner: signer, commitment: commitmentAddr, treasury });
      else if (row.type === "NoTradeWindow") ix = await getCancelNoTradeWindowInstructionAsync({ owner: signer, commitment: commitmentAddr, treasury });
      else ix = await getCancelAgentGuardianInstructionAsync({ owner: signer, treasury });
      const sig = await send({ instructions: [ix] });
      toast.success(`Cancelled: ${sig.slice(0, 8)}…`);
      userCommits.refresh();
      setConfirmCancelPubkey(null);
      setConfirmInput("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (!owner) {
    return (
      <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
        <h3 className="text-lg font-bold" style={{ color: "var(--gold)" }}>My Commitments</h3>
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>Connect a wallet to view your commitments.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <h3 className="text-lg font-bold mb-4" style={{ color: "var(--gold)" }}>My Commitments</h3>
      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No active commitments yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const unlockable = isUnlockable(row);
            const progress = progressPct(row);
            const yieldL = pendingYield(row);
            return (
              <div key={row.pubkey} className="p-3 rounded" style={{ background: "var(--input)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{row.label}</span>
                  <span className="text-xs" style={{ color: unlockable ? "#fcd34d" : "#86efac" }}>
                    {unlockable ? "🟡 Unlockable" : "🟢 Active"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mb-2" style={{ color: "var(--muted)" }}>
                  <span>Stake: <span style={{ color: "var(--foreground)" }}>{(Number(row.stakeAmount) / 1e9).toFixed(4)} SOL</span></span>
                  <span>Progress: <span style={{ color: progress > 100 ? "#fcd34d" : "var(--foreground)" }}>{progress.toFixed(1)}%</span></span>
                  <span>Yield: <span style={{ color: "var(--gold)" }}>+{(Number(yieldL) / 1e9).toFixed(6)} SOL</span></span>
                </div>
                <div className="flex gap-2">
                  {unlockable ? (
                    <button onClick={() => handleClaim(row)} disabled={isSending} className="px-3 py-1 rounded text-xs font-bold" style={{ background: "var(--gold)", color: "var(--background)" }}>
                      Claim
                    </button>
                  ) : (
                    <button onClick={() => { setConfirmCancelPubkey(row.pubkey); setConfirmInput(""); }} disabled={isSending} className="px-3 py-1 rounded text-xs" style={{ background: "transparent", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.4)" }}>
                      Cancel
                    </button>
                  )}
                </div>
                {confirmCancelPubkey === row.pubkey && (
                  <div className="mt-3 p-3 rounded" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.4)" }}>
                    <p className="text-xs mb-2" style={{ color: "#fca5a5" }}>
                      Cancelling forfeits your full stake to the reward pool. Type <code>cancel</code> to confirm.
                    </p>
                    <input value={confirmInput} onChange={(e) => setConfirmInput(e.target.value)} className="w-full px-2 py-1 rounded text-sm mb-2" style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }} />
                    <div className="flex gap-2">
                      <button onClick={() => handleCancelConfirm(row)} disabled={confirmInput !== "cancel" || isSending} className="px-3 py-1 rounded text-xs font-bold" style={{ background: confirmInput === "cancel" ? "#dc2626" : "var(--input)", color: "#fff", opacity: confirmInput === "cancel" ? 1 : 0.5 }}>
                        Confirm Cancel
                      </button>
                      <button onClick={() => { setConfirmCancelPubkey(null); setConfirmInput(""); }} className="px-3 py-1 rounded text-xs" style={{ background: "var(--input)", color: "var(--muted)" }}>
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
