"use client";

import useSWR from "swr";
import { useMemo, useEffect } from "react";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { useUserCommitments } from "./use-user-commitments";
import { fetchTerminationEventsForOwner, type TerminationKind } from "../events";
import { loadCachedCommitments, saveCachedCommitment, loadLocalTerminations, type CachedCommitment } from "../my-commitments-cache";
import type { CommitmentTypeKey } from "../commitment-types";

export type CommitmentStatus = "Processing" | "Claimable" | TerminationKind;

export type MergedCommitment = {
  pubkey: string;
  owner: string;
  type: CommitmentTypeKey;
  status: CommitmentStatus;
  // Common fields
  stakeLamports: bigint;
  weight?: bigint;
  rewardDebt?: bigint;
  createdAt: bigint;
  expiresAt?: bigint;
  // Per-type display
  targetMint?: string;
  floorAmount?: bigint;
  windowStartHour?: number;
  windowEndHour?: number;
  guardianPubkey?: string;
  // Terminal extras
  terminationSig?: string;
  terminationBlockTime?: number | null;
  yieldPaid?: bigint;
};

export function useMyCommitmentsWithHistory(owner: string | undefined): {
  rows: MergedCommitment[];
  isLoading: boolean;
  refresh: () => void;
} {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const live = useUserCommitments(owner);

  // Termination events for the owner — only refresh occasionally; chain RPC
  // is rate-limited and these are read-mostly.
  const { data: terminations, mutate: mutateTerm, isLoading: termLoading } = useSWR(
    owner ? ["my-terminations", url, owner] : null,
    () => fetchTerminationEventsForOwner(url, owner!, 200),
    { refreshInterval: 60_000, dedupingInterval: 30_000 },
  );

  const cached: CachedCommitment[] = useMemo(
    () => (owner ? loadCachedCommitments(owner) : []),
    [owner, terminations], // re-read after termination poll so freshly-cached creates show up
  );

  // Sync live commitments to localStorage so terminated entries survive account closure.
  // This is a safety net: if the creation-time cache write failed silently, the commitment
  // will still appear in history once it's been seen here at least once while active.
  useEffect(() => {
    if (!owner) return;
    const base = (c: { pubkey: string; owner: string; stakeAmount: bigint; createdAt: bigint; expiresAt: bigint }) => ({
      pubkey: c.pubkey,
      owner: c.owner,
      stakeLamports: c.stakeAmount.toString(),
      durationDays: Number((c.expiresAt - c.createdAt) / 86400n),
      createdAt: Number(c.createdAt),
    });
    for (const c of live.noSell) {
      saveCachedCommitment({ ...base(c), type: "NoSell", targetMint: c.targetMint, floorAmount: c.floorAmount.toString() });
    }
    for (const c of live.holdAbove) {
      saveCachedCommitment({ ...base(c), type: "HoldAbove", targetMint: c.targetMint, floorAmount: c.floorAmount.toString() });
    }
    for (const c of live.noTradeWindow) {
      saveCachedCommitment({ ...base(c), type: "NoTradeWindow", windowStartHour: c.windowStartHour, windowEndHour: c.windowEndHour, nonce: c.nonce.toString() });
    }
    if (live.agentGuardian) {
      const c = live.agentGuardian;
      saveCachedCommitment({ ...base(c), type: "AgentGuardian", guardianPubkey: c.guardianPubkey });
    }
  }, [owner, live]);

  const rows = useMemo<MergedCommitment[]>(() => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    const out: MergedCommitment[] = [];
    const seenPubkeys = new Set<string>();

    // 1. Active rows from chain
    for (const c of live.noSell) {
      seenPubkeys.add(c.pubkey);
      const status: CommitmentStatus = now >= c.expiresAt ? "Claimable" : "Processing";
      out.push({
        pubkey: c.pubkey,
        owner: c.owner,
        type: "NoSell",
        status,
        stakeLamports: c.stakeAmount,
        weight: c.weight,
        rewardDebt: c.rewardDebt,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
        targetMint: c.targetMint,
        floorAmount: c.floorAmount,
      });
    }
    for (const c of live.holdAbove) {
      seenPubkeys.add(c.pubkey);
      const status: CommitmentStatus = now >= c.expiresAt ? "Claimable" : "Processing";
      out.push({
        pubkey: c.pubkey,
        owner: c.owner,
        type: "HoldAbove",
        status,
        stakeLamports: c.stakeAmount,
        weight: c.weight,
        rewardDebt: c.rewardDebt,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
        targetMint: c.targetMint,
        floorAmount: c.floorAmount,
      });
    }
    for (const c of live.noTradeWindow) {
      seenPubkeys.add(c.pubkey);
      const status: CommitmentStatus = now >= c.expiresAt ? "Claimable" : "Processing";
      out.push({
        pubkey: c.pubkey,
        owner: c.owner,
        type: "NoTradeWindow",
        status,
        stakeLamports: c.stakeAmount,
        weight: c.weight,
        rewardDebt: c.rewardDebt,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
        windowStartHour: c.windowStartHour,
        windowEndHour: c.windowEndHour,
      });
    }
    if (live.agentGuardian) {
      const c = live.agentGuardian;
      seenPubkeys.add(c.pubkey);
      const status: CommitmentStatus = now >= c.expiresAt ? "Claimable" : "Processing";
      out.push({
        pubkey: c.pubkey,
        owner: c.owner,
        type: "AgentGuardian",
        status,
        stakeLamports: c.stakeAmount,
        weight: c.weight,
        rewardDebt: c.rewardDebt,
        createdAt: c.createdAt,
        expiresAt: c.expiresAt,
        guardianPubkey: c.guardianPubkey,
      });
    }

    // 2. Terminal rows: cached commitments not in `seenPubkeys`,
    // matched against termination events for status.
    // Chain events (authoritative) take priority; local optimistic cache is fallback.
    const termByPubkey = new Map<string, NonNullable<typeof terminations>[number]>();
    for (const t of terminations ?? []) {
      // For idempotency keep the first match (most recent first from getSignaturesForAddress)
      if (!termByPubkey.has(t.commitment)) termByPubkey.set(t.commitment, t);
    }
    const localTermByPubkey = new Map<string, { kind: "Claimed" | "Cancelled" | "Slashed"; signature: string }>();
    if (owner) {
      for (const t of loadLocalTerminations(owner)) {
        if (!localTermByPubkey.has(t.pubkey)) localTermByPubkey.set(t.pubkey, t);
      }
    }

    for (const c of cached) {
      if (seenPubkeys.has(c.pubkey)) continue; // still active on chain
      const term = termByPubkey.get(c.pubkey);
      const localTerm = localTermByPubkey.get(c.pubkey);
      const stakeLamports = BigInt(c.stakeLamports);
      const expiresAt = BigInt(c.createdAt) + BigInt(c.durationDays) * 86400n;
      // Priority: chain event > local optimistic > "Active" (account gone but not indexed yet)
      const status: CommitmentStatus = term ? term.kind : localTerm ? localTerm.kind : "Active";
      out.push({
        pubkey: c.pubkey,
        owner: c.owner,
        type: c.type,
        status,
        stakeLamports,
        createdAt: BigInt(c.createdAt),
        expiresAt,
        targetMint: c.targetMint,
        floorAmount: c.floorAmount ? BigInt(c.floorAmount) : undefined,
        windowStartHour: c.windowStartHour,
        windowEndHour: c.windowEndHour,
        guardianPubkey: c.guardianPubkey,
        terminationSig: term?.signature ?? localTerm?.signature,
        terminationBlockTime: term?.blockTime ?? null,
        yieldPaid: term?.yieldPaid,
      });
    }

    // Sort: active first, then by createdAt desc within each group
    return out.sort((a, b) => {
      const aActive = a.status === "Processing" || a.status === "Claimable" ? 0 : 1;
      const bActive = b.status === "Processing" || b.status === "Claimable" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return Number(b.createdAt - a.createdAt);
    });
  }, [live, cached, terminations]);

  return {
    rows,
    isLoading: termLoading,
    refresh: () => {
      live.refresh();
      void mutateTerm();
    },
  };
}
