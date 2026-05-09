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

export type ProtocolMetrics = {
  totalWeight: bigint;
  activeCommitments: number;
  totalStakedLamports: bigint;
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

  for (const acc of all) {
    const data = base64ToBytes(acc.account.data[0]);
    // Common pattern: stake_amount + weight are u64 fields. Their offsets vary.
    // We do a coarse parse: walk through each type's known layout.
    // For simplicity, sum lamports from vault accounts via a separate path is heavier.
    // Approach: decode using offsets from each type:
    //   - NoSell/HoldAbove: disc8 owner32 mint32 floor8 stake8 weight8 ...
    //   - NoTrade:          disc8 owner32 nonce8 startH1 endH1 stake8 weight8 ...
    //   - AgentGuardian:    disc8 owner32 guardian32 stake8 weight8 ...
    const disc = data.slice(0, 8);
    if (eq(disc, NO_SELL_COMMITMENT_DISCRIMINATOR) || eq(disc, HOLD_ABOVE_COMMITMENT_DISCRIMINATOR)) {
      totalStaked += readU64LE(data, 8 + 32 + 32 + 8);
      totalWeight += readU64LE(data, 8 + 32 + 32 + 8 + 8);
    } else if (eq(disc, NO_TRADE_WINDOW_COMMITMENT_DISCRIMINATOR)) {
      totalStaked += readU64LE(data, 8 + 32 + 8 + 1 + 1);
      totalWeight += readU64LE(data, 8 + 32 + 8 + 1 + 1 + 8);
    } else if (eq(disc, AGENT_GUARDIAN_COMMITMENT_DISCRIMINATOR)) {
      totalStaked += readU64LE(data, 8 + 32 + 32);
      totalWeight += readU64LE(data, 8 + 32 + 32 + 8);
    }
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

  return {
    totalWeight,
    activeCommitments: all.length,
    totalStakedLamports: totalStaked,
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
    { refreshInterval: 10_000 },
  );
  return data;
}
