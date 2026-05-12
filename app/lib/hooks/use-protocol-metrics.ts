"use client";

import useSWR from "swr";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { getProgramAccountsByDisc, base64ToBytes, rpcCall } from "../rpc";
import {
  AGENT_GUARDIAN_COMMITMENT_DISCRIMINATOR,
  HOLD_ABOVE_COMMITMENT_DISCRIMINATOR,
  NO_SELL_COMMITMENT_DISCRIMINATOR,
  NO_TRADE_WINDOW_COMMITMENT_DISCRIMINATOR,
  VAULT_PROGRAM_ADDRESS,
  getRewardPoolDecoder,
  findRewardPoolPda,
} from "../../generated/vault";
import { getProgramDerivedAddress, getBytesEncoder } from "@solana/kit";

// activeStakedLamports = sum of currently-open commitment vaults (live TVL).
// Slashed/Cancelled/Claimed accounts are closed so they don't count here.
// totalRedistributedLamports = current balance of protocol_vault PDA
// (slash funds awaiting redistribution to disciplined stakers).
// totalEarnedLamports = sum of proportional yields for EXPIRED commitments
// = (sum of expired weights / totalWeight) * vaultBalance.
export type ProtocolMetrics = {
  totalWeight: bigint;
  activeCommitments: number;
  activeStakedLamports: bigint;
  totalRedistributedLamports: bigint;
  totalEarnedLamports: bigint;
  accRewardPerWeight: bigint;
  treasury: string;
};

// Offsets within commitment account: weight is at different positions per type.
// All 4 share: discriminator(8) + owner(32) + ...
// We only need stake_amount and weight totals — read by full decode-by-type.

function readU64LE(b: Uint8Array, o: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(b[o + i]) << BigInt(8 * i);
  return v;
}

function readI64LE(b: Uint8Array, o: number): bigint {
  const v = readU64LE(b, o);
  return v >= 0x8000000000000000n ? v - 0x10000000000000000n : v;
}

async function fetchMetrics(rpcUrl: string): Promise<ProtocolMetrics> {
  const programId = VAULT_PROGRAM_ADDRESS;
  const [noSell, holdAbove, noTrade, agentGuardian] = await Promise.all([
    getProgramAccountsByDisc(rpcUrl, programId, NO_SELL_COMMITMENT_DISCRIMINATOR),
    getProgramAccountsByDisc(rpcUrl, programId, HOLD_ABOVE_COMMITMENT_DISCRIMINATOR),
    getProgramAccountsByDisc(rpcUrl, programId, NO_TRADE_WINDOW_COMMITMENT_DISCRIMINATOR),
    getProgramAccountsByDisc(rpcUrl, programId, AGENT_GUARDIAN_COMMITMENT_DISCRIMINATOR),
  ]);

  const all = [...noSell, ...holdAbove, ...noTrade, ...agentGuardian];

  let totalStaked = 0n;
  let totalWeight = 0n;
  const now = BigInt(Math.floor(Date.now() / 1000));

  // Offsets per type: disc8 + struct fields (Borsh, no padding)
  //   NoSell/HoldAbove: owner32 mint32 floor8 | stake@80 weight@88 rewardDebt16 createdAt8 expiresAt@120
  //   NoTrade:          owner32 nonce8 startH1 endH1 | stake@50 weight@58 rewardDebt16 createdAt8 expiresAt@90
  //   AgentGuardian:    owner32 guardian32 | stake@72 weight@80 rewardDebt16 createdAt8 expiresAt@112
  type WInfo = { weight: bigint; expiresAt: bigint };
  const wInfos: WInfo[] = [];

  for (const acc of all) {
    const data = base64ToBytes(acc.account.data[0]);
    const disc = data.slice(0, 8);
    let weight: bigint;
    let expiresAt: bigint;
    if (eq(disc, NO_SELL_COMMITMENT_DISCRIMINATOR) || eq(disc, HOLD_ABOVE_COMMITMENT_DISCRIMINATOR)) {
      totalStaked += readU64LE(data, 80);
      weight = readU64LE(data, 88);
      expiresAt = readI64LE(data, 120);
    } else if (eq(disc, NO_TRADE_WINDOW_COMMITMENT_DISCRIMINATOR)) {
      totalStaked += readU64LE(data, 50);
      weight = readU64LE(data, 58);
      expiresAt = readI64LE(data, 90);
    } else if (eq(disc, AGENT_GUARDIAN_COMMITMENT_DISCRIMINATOR)) {
      totalStaked += readU64LE(data, 72);
      weight = readU64LE(data, 80);
      expiresAt = readI64LE(data, 112);
    } else {
      continue;
    }
    totalWeight += weight;
    wInfos.push({ weight, expiresAt });
  }

  // Reward pool
  let accRewardPerWeight = 0n;
  let treasury = "";
  try {
    const [rpAddr] = await findRewardPoolPda();
    const acc = await rpcCall<{ value: { data: [string, string] } | null }>(
      rpcUrl,
      "getAccountInfo",
      [rpAddr.toString(), { encoding: "base64" }],
    );
    if (acc?.value?.data) {
      const bytes = base64ToBytes(acc.value.data[0]);
      const decoded = getRewardPoolDecoder().decode(bytes);
      accRewardPerWeight = decoded.accRewardPerWeight;
      treasury = decoded.treasury;
    }
  } catch {
    /* reward pool may not yet exist on a fresh deployment */
  }

  // Redistributed: lamports currently sitting in the protocol_vault PDA.
  // protocol_vault is a 0-data SystemAccount; balance = pool of redistributed slash funds.
  let totalRedistributed = 0n;
  try {
    const [pvAddr] = await getProgramDerivedAddress({
      programAddress: VAULT_PROGRAM_ADDRESS,
      seeds: [getBytesEncoder().encode(new Uint8Array([112, 114, 111, 116, 111, 99, 111, 108, 95, 118, 97, 117, 108, 116]))], // "protocol_vault"
    });
    const acc = await rpcCall<{ value: { lamports: number } | null }>(
      rpcUrl,
      "getAccountInfo",
      [pvAddr.toString(), { encoding: "base64" }],
    );
    if (acc?.value) totalRedistributed = BigInt(acc.value.lamports);
  } catch {
    /* ignore */
  }

  let earnedWeightSum = 0n;
  for (const { weight, expiresAt } of wInfos) {
    if (now >= expiresAt) earnedWeightSum += weight;
  }
  const totalEarnedLamports = totalWeight > 0n
    ? (earnedWeightSum * totalRedistributed) / totalWeight
    : 0n;

  return {
    totalWeight,
    activeCommitments: all.length,
    activeStakedLamports: totalStaked,
    totalRedistributedLamports: totalRedistributed,
    totalEarnedLamports,
    accRewardPerWeight,
    treasury,
  };
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function useProtocolMetrics(): ProtocolMetrics | undefined {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const { data } = useSWR(
    ["protocol-metrics", url],
    () => fetchMetrics(url),
    { refreshInterval: 60_000, dedupingInterval: 30_000 },
  );
  return data;
}
