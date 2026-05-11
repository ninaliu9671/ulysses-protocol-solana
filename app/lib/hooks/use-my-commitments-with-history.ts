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

  // Watcher API is source of truth; chain scan only runs when watcher fails.
  // A successful empty response from watcher must NOT fall back to chain,
  // otherwise EVENT_CUTOFF_TS would be defeated.
  const watcherUrl = process.env.NEXT_PUBLIC_WATCHER_URL || "http://localhost:3001";
  type WatcherEvent = {
    kind: TerminationKind;
    signature: string;
    blockTime: number;
    commitment: string;
    owner: string;
    principal: string;
    typeName: string | null;
    targetMint: string | null;
    createdAt: number | null;
    expiresAt: number | null;
    yieldPaid: string | null;
  };
  const { data: watcherEvents, error: watcherError, mutate: mutateWatcher } = useSWR(
    owner ? ["watcher-events", watcherUrl, owner] : null,
    async (): Promise<WatcherEvent[]> => {
      const res = await fetch(`${watcherUrl}/events?owner=${owner}&limit=200`);
      if (!res.ok) throw new Error(`watcher /events ${res.status}`);
      const json = await res.json();
      return json.events as WatcherEvent[];
    },
    { refreshInterval: 60_000, dedupingInterval: 30_000 },
  );

  // Chain scan: only when watcher is unreachable.
  const { data: chainTerminations, mutate: mutateTerm, isLoading: termLoading } = useSWR(
    owner && watcherError ? ["my-terminations", url, owner] : null,
    () => fetchTerminationEventsForOwner(url, owner!, 200),
    { refreshInterval: 60_000, dedupingInterval: 30_000 },
  );

  // Unified termination view used downstream. When watcher responds (even empty),
  // use it exclusively; chainTerminations only surfaces if watcher errored.
  const terminations = watcherEvents !== undefined ? null : chainTerminations;

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
      durationSeconds: Number(c.expiresAt - c.createdAt),
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
    // Priority: watcher API > chain events > local optimistic cache
    const termByPubkey = new Map<string, NonNullable<typeof terminations>[number]>();

    // Merge watcher events (convert to chain event format)
    if (watcherEvents) {
      for (const w of watcherEvents) {
        if (!termByPubkey.has(w.commitment)) {
          termByPubkey.set(w.commitment, {
            kind: w.kind,
            signature: w.signature,
            blockTime: w.blockTime,
            commitment: w.commitment,
            owner: w.owner,
            principal: BigInt(w.principal),
            yieldPaid: w.yieldPaid ? BigInt(w.yieldPaid) : undefined,
            commitmentType: (w.typeName as any) || "Unknown",
            targetMint: w.targetMint,
            createdAt: w.createdAt,
            expiresAt: w.expiresAt,
          });
        }
      }
    }

    // Merge chain events (watcher takes priority, so only add if not present)
    for (const t of terminations ?? []) {
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
      const expiresAt = BigInt(c.createdAt) + BigInt(c.durationSeconds);
      // Priority: chain event > local optimistic > "Processing" (account gone but not indexed yet)
      const status: CommitmentStatus = term ? term.kind : localTerm ? localTerm.kind : "Processing";
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

    // 3. Event-only rows: termination events with no cached metadata
    // Requires post-upgrade events (createdAt/expiresAt non-null).
    for (const [commitmentPubkey, t] of termByPubkey.entries()) {
      if (seenPubkeys.has(commitmentPubkey)) continue; // still live
      if (cached.find((c) => c.pubkey === commitmentPubkey)) continue; // handled above
      if (t.createdAt == null || t.expiresAt == null) continue; // old event, skip
      seenPubkeys.add(commitmentPubkey); // prevent duplicates
      const stakeLamports = t.principal;
      const expiresAt = BigInt(t.expiresAt);
      const createdAt = BigInt(t.createdAt);
      out.push({
        pubkey: t.commitment,
        owner: t.owner,
        type: t.commitmentType === "Unknown" ? "NoSell" : t.commitmentType,
        status: t.kind,
        stakeLamports,
        createdAt,
        expiresAt,
        targetMint: t.targetMint ?? undefined,
        terminationSig: t.signature,
        terminationBlockTime: t.blockTime,
        yieldPaid: t.yieldPaid,
      });
    }

    // Sort: active first, then by createdAt desc within each group
    return out.sort((a, b) => {
      const aActive = a.status === "Processing" || a.status === "Claimable" ? 0 : 1;
      const bActive = b.status === "Processing" || b.status === "Claimable" ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return Number(b.createdAt - a.createdAt);
    });
  }, [live, cached, terminations, watcherEvents]);

  return {
    rows,
    isLoading: termLoading,
    refresh: () => {
      live.refresh();
      void mutateTerm();
      void mutateWatcher();
    },
  };
}
