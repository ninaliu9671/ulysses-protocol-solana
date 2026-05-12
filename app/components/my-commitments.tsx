"use client";

import { useState } from "react";
import { address } from "@solana/kit";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useProtocolMetrics } from "../lib/hooks/use-protocol-metrics";
import {
  useMyCommitmentsWithHistory,
  type MergedCommitment,
  type CommitmentStatus,
} from "../lib/hooks/use-my-commitments-with-history";
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
import { TYPE_BY_KEY } from "../lib/commitment-types";
import { saveLocalTermination } from "../lib/my-commitments-cache";
import { lamportsToDisplaySol } from "../lib/lamports";

const STATUS_BADGES: Record<CommitmentStatus, { emoji: string; label: string; color: string }> = {
  Processing: { emoji: "🟡", label: "Processing", color: "#fcd34d" },
  Claimable:  { emoji: "🟢", label: "Claimable",  color: "#86efac" },
  Slashed:    { emoji: "💀", label: "Failed",      color: "#fca5a5" },
  Cancelled:  { emoji: "⚫", label: "Cancelled",   color: "#9ca3af" },
  Claimed:    { emoji: "🎉", label: "Claimed",     color: "#86efac" },
};

function labelFor(row: MergedCommitment): string {
  const meta = TYPE_BY_KEY[row.type];
  switch (row.type) {
    case "NoSell":
      return `${meta.emoji} NoSell · ${row.targetMint?.slice(0, 4)}…${row.targetMint?.slice(-4)}`;
    case "HoldAbove":
      return `${meta.emoji} HoldAbove · ${row.targetMint?.slice(0, 4)}…${row.targetMint?.slice(-4)} ≥ ${row.floorAmount?.toString() ?? "?"}`;
    case "NoTradeWindow":
      return `${meta.emoji} NoTradeWindow · ${String(row.windowStartHour ?? 0).padStart(2, "0")}:00→${String(row.windowEndHour ?? 0).padStart(2, "0")}:00 UTC`;
    case "AgentGuardian":
      return `${meta.emoji} AgentGuardian · ${row.guardianPubkey?.slice(0, 4)}…${row.guardianPubkey?.slice(-4)}`;
  }
}

export function MyCommitmentsSection() {
  const { signer } = useWallet();
  const { send, isSending } = useSendTransaction();
  const owner = signer?.address;
  const { rows, refresh } = useMyCommitmentsWithHistory(owner);
  const metrics = useProtocolMetrics();
  const [confirmCancelPubkey, setConfirmCancelPubkey] = useState<string | null>(null);
  const [confirmInput, setConfirmInput] = useState("");

  function pendingYield(row: MergedCommitment): bigint {
    if (!metrics || !row.weight) return 0n;
    const vaultBalance = metrics.totalRedistributedLamports;
    const globalWeight = metrics.totalWeight;
    if (globalWeight <= 0n) return 0n;
    return (row.weight * vaultBalance) / globalWeight;
  }

  function progressPct(row: MergedCommitment): number {
    if (!row.expiresAt) return 0;
    const now = BigInt(Math.floor(Date.now() / 1000));
    const total = row.expiresAt - row.createdAt;
    if (total <= 0n) return 0;
    const elapsed = now - row.createdAt;
    if (elapsed <= 0n) return 0;
    return Number((elapsed * 1000n) / total) / 10;
  }

  async function handleClaim(row: MergedCommitment) {
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
      if (owner) saveLocalTermination(owner, { pubkey: row.pubkey, kind: "Claimed", signature: sig });
      refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCancelConfirm(row: MergedCommitment) {
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
      if (owner) saveLocalTermination(owner, { pubkey: row.pubkey, kind: "Cancelled", signature: sig });
      refresh();
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
        <p className="text-sm" style={{ color: "var(--muted)" }}>No commitments yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const badge = STATUS_BADGES[row.status];
            const isTerminal = row.status === "Slashed" || row.status === "Cancelled" || row.status === "Claimed";
            const progress = progressPct(row);
            const yieldL = pendingYield(row);
            return (
              <div
                key={row.pubkey}
                className="p-3 rounded"
                style={{
                  background: "var(--input)",
                  border: "1px solid var(--border)",
                  opacity: isTerminal ? 0.7 : 1,
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{labelFor(row)}</span>
                  <span className="text-xs" style={{ color: badge.color }}>
                    {badge.emoji} {badge.label}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs mb-2 flex-wrap gap-y-1" style={{ color: "var(--muted)" }}>
                  <span>Stake: <span style={{ color: "var(--foreground)" }}>{lamportsToDisplaySol(row.stakeLamports, 2)} SOL</span></span>
                  {!isTerminal && (
                    <>
                      <span>Progress: <span style={{ color: progress > 100 ? "#fcd34d" : "var(--foreground)" }}>{progress.toFixed(1)}%</span></span>
                      <span>Yield: <span style={{ color: "var(--gold)" }}>+{lamportsToDisplaySol(yieldL, 2)} SOL</span></span>
                    </>
                  )}
                  {row.status === "Slashed" && (
                    <span style={{ color: "#fca5a5" }}>Loss: −{lamportsToDisplaySol(row.stakeLamports, 2)} SOL → reward pool</span>
                  )}
                  {row.status === "Cancelled" && (
                    <span style={{ color: "#fca5a5" }}>Loss: −{lamportsToDisplaySol(row.stakeLamports, 2)} SOL → reward pool</span>
                  )}
                  {row.status === "Claimed" && row.yieldPaid !== undefined && (
                    <span style={{ color: "#86efac" }}>Earned: +{lamportsToDisplaySol(row.yieldPaid, 2)} SOL</span>
                  )}
                </div>
                {!isTerminal && (
                  <div className="flex gap-2">
                    {row.status === "Claimable" ? (
                      <button
                        onClick={() => handleClaim(row)}
                        disabled={isSending}
                        className="px-3 py-1 rounded text-xs font-bold"
                        style={{ background: "var(--gold)", color: "var(--background)" }}
                      >
                        Claim
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setConfirmCancelPubkey(row.pubkey);
                          setConfirmInput("");
                        }}
                        disabled={isSending}
                        className="px-3 py-1 rounded text-xs"
                        style={{ background: "transparent", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.4)" }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
                {confirmCancelPubkey === row.pubkey && (
                  <div className="mt-3 p-3 rounded" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.4)" }}>
                    <p className="text-xs mb-2" style={{ color: "#fca5a5" }}>
                      Cancelling forfeits your full stake to the reward pool. Type <code>cancel</code> to confirm.
                    </p>
                    <input
                      value={confirmInput}
                      onChange={(e) => setConfirmInput(e.target.value)}
                      className="w-full px-2 py-1 rounded text-sm mb-2"
                      style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCancelConfirm(row)}
                        disabled={confirmInput !== "cancel" || isSending}
                        className="px-3 py-1 rounded text-xs font-bold"
                        style={{
                          background: confirmInput === "cancel" ? "#dc2626" : "var(--input)",
                          color: "#fff",
                          opacity: confirmInput === "cancel" ? 1 : 0.5,
                        }}
                      >
                        Confirm Cancel
                      </button>
                      <button
                        onClick={() => {
                          setConfirmCancelPubkey(null);
                          setConfirmInput("");
                        }}
                        className="px-3 py-1 rounded text-xs"
                        style={{ background: "var(--input)", color: "var(--muted)" }}
                      >
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
