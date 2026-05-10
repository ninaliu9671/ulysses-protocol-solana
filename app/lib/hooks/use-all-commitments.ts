"use client";

import useSWR from "swr";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl } from "../solana-client";
import { getProgramAccountsByDisc, base64ToBytes } from "../rpc";
import {
  AGENT_GUARDIAN_COMMITMENT_DISCRIMINATOR,
  HOLD_ABOVE_COMMITMENT_DISCRIMINATOR,
  NO_SELL_COMMITMENT_DISCRIMINATOR,
  NO_TRADE_WINDOW_COMMITMENT_DISCRIMINATOR,
  VAULT_PROGRAM_ADDRESS,
  getNoSellCommitmentDecoder,
  getHoldAboveCommitmentDecoder,
  getNoTradeWindowCommitmentDecoder,
  getAgentGuardianCommitmentDecoder,
} from "../../generated/vault";

export type AllCommitment = {
  pubkey: string;
  owner: string;
  type: "NoSell" | "HoldAbove" | "NoTradeWindow" | "AgentGuardian";
  stakeAmount: bigint;
  weight: bigint;
  rewardDebt: bigint;
  createdAt: bigint;
  expiresAt: bigint;
};

async function fetchAll(rpcUrl: string): Promise<AllCommitment[]> {
  const programId = VAULT_PROGRAM_ADDRESS;
  const [noSell, holdAbove, noTrade, agentGuardian] = await Promise.all([
    getProgramAccountsByDisc(rpcUrl, programId, NO_SELL_COMMITMENT_DISCRIMINATOR),
    getProgramAccountsByDisc(rpcUrl, programId, HOLD_ABOVE_COMMITMENT_DISCRIMINATOR),
    getProgramAccountsByDisc(rpcUrl, programId, NO_TRADE_WINDOW_COMMITMENT_DISCRIMINATOR),
    getProgramAccountsByDisc(rpcUrl, programId, AGENT_GUARDIAN_COMMITMENT_DISCRIMINATOR),
  ]);
  const out: AllCommitment[] = [];
  for (const r of noSell) {
    const d = getNoSellCommitmentDecoder().decode(base64ToBytes(r.account.data[0]));
    out.push({ pubkey: r.pubkey, owner: d.owner, type: "NoSell", stakeAmount: d.stakeAmount, weight: d.weight, rewardDebt: d.rewardDebt, createdAt: d.createdAt, expiresAt: d.expiresAt });
  }
  for (const r of holdAbove) {
    const d = getHoldAboveCommitmentDecoder().decode(base64ToBytes(r.account.data[0]));
    out.push({ pubkey: r.pubkey, owner: d.owner, type: "HoldAbove", stakeAmount: d.stakeAmount, weight: d.weight, rewardDebt: d.rewardDebt, createdAt: d.createdAt, expiresAt: d.expiresAt });
  }
  for (const r of noTrade) {
    const d = getNoTradeWindowCommitmentDecoder().decode(base64ToBytes(r.account.data[0]));
    out.push({ pubkey: r.pubkey, owner: d.owner, type: "NoTradeWindow", stakeAmount: d.stakeAmount, weight: d.weight, rewardDebt: d.rewardDebt, createdAt: d.createdAt, expiresAt: d.expiresAt });
  }
  for (const r of agentGuardian) {
    const d = getAgentGuardianCommitmentDecoder().decode(base64ToBytes(r.account.data[0]));
    out.push({ pubkey: r.pubkey, owner: d.owner, type: "AgentGuardian", stakeAmount: d.stakeAmount, weight: d.weight, rewardDebt: d.rewardDebt, createdAt: d.createdAt, expiresAt: d.expiresAt });
  }
  return out;
}

export function useAllCommitments(): AllCommitment[] | undefined {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const { data } = useSWR(["all-commitments", url], () => fetchAll(url), {
    refreshInterval: 60_000,
    dedupingInterval: 30_000,
  });
  return data;
}
