"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  address,
  type Address,
  type IAccountMeta,
  type Instruction,
  getProgramDerivedAddress,
  getAddressEncoder,
} from "@solana/kit";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useCluster } from "./cluster-context";
import { getClusterUrl } from "../lib/solana-client";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROGRAM_ID: Address = address(
  "7s1UK1nQWK7CrNcaS576gbpMjMqrph1vArRepnQYLki7"
);
const SYSTEM_PROGRAM: Address = address("11111111111111111111111111111111");

// CommitmentAccount discriminator: sha256("account:CommitmentAccount")[0:8]
const COMMITMENT_DISCRIMINATOR = new Uint8Array([155, 206, 108, 147, 168, 110, 100, 181]);

// Base58 alphabet for Solana addresses
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function bytes32ToBase58(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  if (num === 0n) return "1".repeat(bytes.length);
  const parts: string[] = [];
  while (num > 0n) { parts.unshift(B58[Number(num % 58n)]); num /= 58n; }
  const leading = bytes.findIndex((b) => b !== 0);
  return "1".repeat(leading < 0 ? 0 : leading) + parts.join("");
}

// Instruction discriminators (from IDL / sha256("global:<name>")[0:8])
const CANCEL_DISC = new Uint8Array([36, 39, 70, 137, 71, 179, 88, 232]);

async function computeDisc(name: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`global:${name}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash).slice(0, 8);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CommitmentKind = "NoBuy" | "NoSell" | "HoldAbove" | "HoldUntil" | "NoTradeWindow" | "AgentGuardian";

interface CommitmentTypeData {
  kind: CommitmentKind;
  threshold?: bigint;   // HoldAbove
  unlockAt?: bigint;    // HoldUntil
  startHour?: number;   // NoTradeWindow
  endHour?: number;     // NoTradeWindow
}

interface OnChainCommitment {
  pubkey: string;
  owner: string;
  targetMint: string;
  commitmentType: CommitmentTypeData;
  stakeAmount: bigint;
  guardianPubkey: string | null;
  isActive: boolean;
  createdAt: bigint;
  bump: number;
  vaultBump: number;
  weight: bigint;
  rewardDebt: bigint;
  unlockTime: bigint;
  poolId: number;
}

// ─── Borsh decoder ────────────────────────────────────────────────────────────

function readU64(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getBigUint64(0, true);
}

function readI64(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset + offset, 8);
  return view.getBigInt64(0, true);
}

// Encode discriminator as base64 for RPC memcmp filter
function discToBase64(disc: Uint8Array): string {
  return btoa(String.fromCharCode(...disc));
}

function decodeCommitmentAccount(
  pubkey: string,
  rawData: Uint8Array
): OnChainCommitment | null {
  try {
    let o = 8; // skip 8-byte discriminator

    const owner = bytes32ToBase58(rawData.slice(o, o + 32)); o += 32;
    const targetMint = bytes32ToBase58(rawData.slice(o, o + 32)); o += 32;

    const tag = rawData[o]; o += 1;
    let commitmentType: CommitmentTypeData;
    switch (tag) {
      case 0: commitmentType = { kind: "NoBuy" }; break;
      case 1: commitmentType = { kind: "NoSell" }; break;
      case 2: {
        const threshold = readU64(rawData, o); o += 8;
        commitmentType = { kind: "HoldAbove", threshold };
        break;
      }
      case 3: {
        const unlockAt = readI64(rawData, o); o += 8;
        commitmentType = { kind: "HoldUntil", unlockAt };
        break;
      }
      case 4: {
        const startHour = rawData[o]; const endHour = rawData[o + 1]; o += 2;
        commitmentType = { kind: "NoTradeWindow", startHour, endHour };
        break;
      }
      case 5: commitmentType = { kind: "AgentGuardian" }; break;
      default: return null;
    }

    const stakeAmount = readU64(rawData, o); o += 8;

    const hasGuardian = rawData[o] === 1; o += 1;
    let guardianPubkey: string | null = null;
    if (hasGuardian) { guardianPubkey = bytes32ToBase58(rawData.slice(o, o + 32)); o += 32; }

    const isActive = rawData[o] === 1; o += 1;
    const createdAt = readI64(rawData, o); o += 8;
    const bump = rawData[o]; o += 1;
    const vaultBump = rawData[o]; o += 1;
    const weight = readU64(rawData, o); o += 8;

    // u128 as two u64s (low + high)
    const rdLow = readU64(rawData, o);
    const rdHigh = readU64(rawData, o + 8);
    const rewardDebt = rdLow + rdHigh * (BigInt(2) ** BigInt(64));
    o += 16;

    const unlockTime = readI64(rawData, o); o += 8;
    const poolId = rawData[o];

    return { pubkey, owner, targetMint, commitmentType, stakeAmount, guardianPubkey, isActive, createdAt, bump, vaultBump, weight, rewardDebt, unlockTime, poolId };
  } catch {
    return null;
  }
}

// ─── Account fetching ─────────────────────────────────────────────────────────

async function fetchCommitments(
  rpcUrl: string,
  ownerAddress: string
): Promise<OnChainCommitment[]> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getProgramAccounts",
    params: [
      PROGRAM_ID,
      {
        filters: [
          { memcmp: { offset: 0, bytes: discToBase64(COMMITMENT_DISCRIMINATOR), encoding: "base64" } },
          { memcmp: { offset: 8, bytes: ownerAddress, encoding: "base58" } },
        ],
        encoding: "base64",
      },
    ],
  };

  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { result: { pubkey: string; account: { data: [string, string] } }[] };

  const accounts: OnChainCommitment[] = [];
  for (const item of json.result ?? []) {
    const bytes = Uint8Array.from(atob(item.account.data[0]), (c) => c.charCodeAt(0));
    const decoded = decodeCommitmentAccount(item.pubkey, bytes);
    if (decoded) accounts.push(decoded);
  }
  return accounts;
}

// ─── PDA helpers ─────────────────────────────────────────────────────────────

async function deriveCommitmentPda(owner: Address, targetMint: Address): Promise<[Address, number]> {
  const enc = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode("commitment"), enc.encode(owner), enc.encode(targetMint)],
  });
}

async function deriveVaultPda(commitmentPda: Address): Promise<[Address, number]> {
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode("vault"), getAddressEncoder().encode(commitmentPda)],
  });
}

async function deriveProtocolStatePda(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode("protocol")],
  });
  return pda;
}

async function deriveProtocolVaultPda(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode("protocol_vault")],
  });
  return pda;
}

// ─── Instruction builders ─────────────────────────────────────────────────────

async function buildClaimInstruction(
  owner: Address,
  commitmentPda: Address,
  vaultPda: Address
): Promise<Instruction> {
  const protocolStatePda = await deriveProtocolStatePda();
  const protocolVaultPda = await deriveProtocolVaultPda();
  const disc = await computeDisc("claim");

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: owner, role: 3 } as IAccountMeta,
      { address: commitmentPda, role: 1 } as IAccountMeta,
      { address: vaultPda, role: 1 } as IAccountMeta,
      { address: protocolStatePda, role: 1 } as IAccountMeta,
      { address: protocolVaultPda, role: 1 } as IAccountMeta,
      { address: SYSTEM_PROGRAM, role: 0 } as IAccountMeta,
    ],
    data: disc,
  };
}

async function buildCancelInstruction(
  owner: Address,
  commitmentPda: Address,
  vaultPda: Address
): Promise<Instruction> {
  const protocolStatePda = await deriveProtocolStatePda();

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: owner, role: 3 } as IAccountMeta,
      { address: commitmentPda, role: 1 } as IAccountMeta,
      { address: vaultPda, role: 1 } as IAccountMeta,
      { address: protocolStatePda, role: 1 } as IAccountMeta,
      { address: SYSTEM_PROGRAM, role: 0 } as IAccountMeta,
    ],
    data: CANCEL_DISC,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimeRemaining(unlockTimeSecs: bigint): string {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const diff = unlockTimeSecs - now;
  if (diff <= 0n) return "Unlocked";
  const s = Number(diff);
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

function commitmentLabel(ct: CommitmentTypeData): string {
  switch (ct.kind) {
    case "NoBuy": return "NoBuy";
    case "NoSell": return "NoSell";
    case "HoldAbove": return `HoldAbove ${(Number(ct.threshold ?? 0n) / 1e9).toFixed(2)} SOL`;
    case "HoldUntil": return `HoldUntil ${new Date(Number(ct.unlockAt ?? 0n) * 1000).toLocaleDateString()}`;
    case "NoTradeWindow": return `NoTrade ${ct.startHour}h–${ct.endHour}h`;
    case "AgentGuardian": return "AgentGuardian";
  }
}

function mintShort(mint: string): string {
  return mint.slice(0, 4) + "…" + mint.slice(-4);
}

function solAmount(lamports: bigint): string {
  return (Number(lamports) / 1e9).toFixed(4);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MyCommitmentsSection() {
  const { wallet, status } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { cluster, getExplorerUrl } = useCluster();
  const [actionPubkey, setActionPubkey] = useState<string | null>(null);

  const walletAddress = wallet?.account.address as Address | undefined;
  const rpcUrl = getClusterUrl(cluster);

  const { data: commitments, isLoading, mutate } = useSWR(
    walletAddress ? ["commitments", cluster, walletAddress] : null,
    async ([, , addr]) => fetchCommitments(rpcUrl, addr as string),
    { refreshInterval: 30_000 }
  );

  const handleClaim = useCallback(async (c: OnChainCommitment) => {
    if (!walletAddress) return;
    setActionPubkey(c.pubkey);
    try {
      const ownerAddr = address(walletAddress);
      const targetAddr = address(c.targetMint);
      const [commitmentPda] = await deriveCommitmentPda(ownerAddr, targetAddr);
      const [vaultPda] = await deriveVaultPda(commitmentPda);
      const ix = await buildClaimInstruction(ownerAddr, commitmentPda, vaultPda);
      const sig = await send({ instructions: [ix] });
      toast.success("Claimed!", {
        description: (
          <a href={getExplorerUrl(`/tx/${sig}`)} target="_blank" rel="noopener noreferrer" className="underline">
            View transaction
          </a>
        ),
      });
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setActionPubkey(null);
    }
  }, [walletAddress, send, getExplorerUrl, mutate]);

  const handleCancel = useCallback(async (c: OnChainCommitment) => {
    if (!walletAddress) return;
    setActionPubkey(c.pubkey);
    try {
      const ownerAddr = address(walletAddress);
      const targetAddr = address(c.targetMint);
      const [commitmentPda] = await deriveCommitmentPda(ownerAddr, targetAddr);
      const [vaultPda] = await deriveVaultPda(commitmentPda);
      const ix = await buildCancelInstruction(ownerAddr, commitmentPda, vaultPda);
      const sig = await send({ instructions: [ix] });
      toast.success("Cancelled (principal refunded, rewards forfeited)", {
        description: (
          <a href={getExplorerUrl(`/tx/${sig}`)} target="_blank" rel="noopener noreferrer" className="underline">
            View transaction
          </a>
        ),
      });
      void mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setActionPubkey(null);
    }
  }, [walletAddress, send, getExplorerUrl, mutate]);

  const notConnected = status !== "connected";
  const nowSecs = BigInt(Math.floor(Date.now() / 1000));

  return (
    <div className="card-ulysses p-6 flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-3" style={{ borderBottom: "1px solid var(--border-low)" }}>
        <span className="section-label">My Commitments</span>
        {!notConnected && (
          <span
            className="rounded px-2 py-0.5 text-xs font-bold"
            style={{ background: "var(--gold-dim)", color: "var(--gold)", border: "1px solid var(--border)" }}
          >
            {commitments?.length ?? "—"} ACTIVE
          </span>
        )}
      </div>

      {notConnected ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-3 rounded py-12"
          style={{ background: "var(--gold-dim)", border: "1px dashed var(--border)" }}
        >
          <WalletIcon />
          <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            Connect your wallet to see
            <br />
            your active commitments.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Loading commitments…</p>
        </div>
      ) : !commitments || commitments.length === 0 ? (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-2 rounded py-12"
          style={{ background: "var(--gold-dim)", border: "1px dashed var(--border)" }}
        >
          <p style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            No active commitments.
            <br />
            Create one to start earning.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {commitments.map((c) => {
            const isUnlocked = c.unlockTime <= nowSecs;
            const isBusy = (isSending && actionPubkey === c.pubkey);
            return (
              <div
                key={c.pubkey}
                className="rounded p-4 flex flex-col gap-3"
                style={{ background: "var(--card-elevated, #1a1710)", border: "1px solid var(--border-low)" }}
              >
                {/* Row 1: type + mint + status */}
                <div className="flex items-center justify-between">
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
                      {commitmentLabel(c.commitmentType)}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "monospace" }}>
                      {mintShort(c.targetMint)}
                    </div>
                  </div>
                  <span className={c.isActive ? "badge-safe" : "badge-slashed"}>
                    {c.isActive ? (isUnlocked ? "UNLOCKED" : "ACTIVE") : "CLOSED"}
                  </span>
                </div>

                {/* Row 2: stats */}
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Staked" value={`${solAmount(c.stakeAmount)} SOL`} />
                  <Stat label="Remaining" value={isUnlocked ? "—" : formatTimeRemaining(c.unlockTime)} />
                </div>

                {/* Actions */}
                {c.isActive && isUnlocked && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleClaim(c)}
                      disabled={isBusy}
                      className="flex-1 rounded py-2 text-xs font-semibold transition disabled:opacity-50"
                      style={{ background: "var(--gold)", color: "#000" }}
                    >
                      {isBusy ? "…" : "Claim + Reward"}
                    </button>
                    <button
                      onClick={() => handleCancel(c)}
                      disabled={isBusy}
                      className="flex-1 rounded py-2 text-xs font-medium transition disabled:opacity-50"
                      style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
                    >
                      {isBusy ? "…" : "Cancel (no reward)"}
                    </button>
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

function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span style={{ fontSize: 9, letterSpacing: "0.08em", color: "var(--muted)", textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: valueColor ?? "var(--foreground)" }}>{value}</span>
    </div>
  );
}

function WalletIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
      <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
    </svg>
  );
}
