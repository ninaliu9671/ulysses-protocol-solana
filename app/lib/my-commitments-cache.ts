"use client";

// Local cache of "commitments this browser has created" so the UI can show
// terminated entries (Slashed / Cancelled / Claimed) — those close their
// on-chain account, so they're invisible to a pure getProgramAccounts query.
//
// Cache is keyed by owner; each owner has a list of commitment-pubkey
// snapshots holding the metadata we need for display (type, target, etc.).
// We never trust the cache for live state; it's only used to look up the
// type+params of a commitment that no longer exists on-chain, after we've
// confirmed via a chain-level termination event that it actually terminated.

import type { CommitmentTypeKey } from "./commitment-types";

export type CachedCommitment = {
  pubkey: string;
  owner: string;
  type: CommitmentTypeKey;
  stakeLamports: string; // bigint stringified
  durationDays: number;
  createdAt: number; // unix seconds
  // Per-type extras
  targetMint?: string;
  floorAmount?: string;
  windowStartHour?: number;
  windowEndHour?: number;
  nonce?: string;
  guardianPubkey?: string;
};

const KEY_PREFIX = "ulysses:my-commitments:v1:";

function storageKey(owner: string): string {
  return `${KEY_PREFIX}${owner}`;
}

export function loadCachedCommitments(owner: string): CachedCommitment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedCommitment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedCommitment(c: CachedCommitment): void {
  if (typeof window === "undefined") return;
  const list = loadCachedCommitments(c.owner);
  // Replace if exists (e.g. PDA reused after slot freed)
  const existing = list.findIndex((x) => x.pubkey === c.pubkey);
  if (existing >= 0) list[existing] = c;
  else list.unshift(c);
  // Cap at 500 per owner to prevent unbounded growth.
  const trimmed = list.slice(0, 500);
  window.localStorage.setItem(storageKey(c.owner), JSON.stringify(trimmed));
}
