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

export type DecodedCommitment<T> = T & { pubkey: string };

export type UserCommitmentsResult = {
  noSell: DecodedCommitment<{
    owner: string;
    targetMint: string;
    floorAmount: bigint;
    stakeAmount: bigint;
    weight: bigint;
    rewardDebt: bigint;
    createdAt: bigint;
    expiresAt: bigint;
  }>[];
  holdAbove: DecodedCommitment<{
    owner: string;
    targetMint: string;
    floorAmount: bigint;
    stakeAmount: bigint;
    weight: bigint;
    rewardDebt: bigint;
    createdAt: bigint;
    expiresAt: bigint;
  }>[];
  noTradeWindow: DecodedCommitment<{
    owner: string;
    nonce: bigint;
    windowStartHour: number;
    windowEndHour: number;
    stakeAmount: bigint;
    weight: bigint;
    rewardDebt: bigint;
    createdAt: bigint;
    expiresAt: bigint;
  }>[];
  agentGuardian: DecodedCommitment<{
    owner: string;
    guardianPubkey: string;
    stakeAmount: bigint;
    weight: bigint;
    rewardDebt: bigint;
    createdAt: bigint;
    expiresAt: bigint;
  }> | null;
  refresh: () => void;
};

async function fetchByOwner(rpcUrl: string, owner: string) {
  const filter = [{ memcmp: { offset: 8, bytes: owner, encoding: "base58" } }];
  const [noSell, holdAbove, noTrade, agentGuardian] = await Promise.all([
    getProgramAccountsByDisc(rpcUrl, VAULT_PROGRAM_ADDRESS, NO_SELL_COMMITMENT_DISCRIMINATOR, filter),
    getProgramAccountsByDisc(rpcUrl, VAULT_PROGRAM_ADDRESS, HOLD_ABOVE_COMMITMENT_DISCRIMINATOR, filter),
    getProgramAccountsByDisc(rpcUrl, VAULT_PROGRAM_ADDRESS, NO_TRADE_WINDOW_COMMITMENT_DISCRIMINATOR, filter),
    getProgramAccountsByDisc(rpcUrl, VAULT_PROGRAM_ADDRESS, AGENT_GUARDIAN_COMMITMENT_DISCRIMINATOR, filter),
  ]);

  return {
    noSell: noSell.map((r) => {
      const d = getNoSellCommitmentDecoder().decode(base64ToBytes(r.account.data[0]));
      return { pubkey: r.pubkey, owner: d.owner, targetMint: d.targetMint, floorAmount: d.floorAmount, stakeAmount: d.stakeAmount, weight: d.weight, rewardDebt: d.rewardDebt, createdAt: d.createdAt, expiresAt: d.expiresAt };
    }),
    holdAbove: holdAbove.map((r) => {
      const d = getHoldAboveCommitmentDecoder().decode(base64ToBytes(r.account.data[0]));
      return { pubkey: r.pubkey, owner: d.owner, targetMint: d.targetMint, floorAmount: d.floorAmount, stakeAmount: d.stakeAmount, weight: d.weight, rewardDebt: d.rewardDebt, createdAt: d.createdAt, expiresAt: d.expiresAt };
    }),
    noTradeWindow: noTrade.map((r) => {
      const d = getNoTradeWindowCommitmentDecoder().decode(base64ToBytes(r.account.data[0]));
      return { pubkey: r.pubkey, owner: d.owner, nonce: d.nonce, windowStartHour: d.windowStartHour, windowEndHour: d.windowEndHour, stakeAmount: d.stakeAmount, weight: d.weight, rewardDebt: d.rewardDebt, createdAt: d.createdAt, expiresAt: d.expiresAt };
    }),
    agentGuardian: agentGuardian.length
      ? (() => {
          const r = agentGuardian[0];
          const d = getAgentGuardianCommitmentDecoder().decode(base64ToBytes(r.account.data[0]));
          return { pubkey: r.pubkey, owner: d.owner, guardianPubkey: d.guardianPubkey, stakeAmount: d.stakeAmount, weight: d.weight, rewardDebt: d.rewardDebt, createdAt: d.createdAt, expiresAt: d.expiresAt };
        })()
      : null,
  };
}

export function useUserCommitments(owner: string | undefined): UserCommitmentsResult {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const { data, mutate } = useSWR(
    owner ? ["user-commitments", url, owner] : null,
    () => fetchByOwner(url, owner!),
    { refreshInterval: 30_000, dedupingInterval: 10_000 },
  );
  return {
    noSell: data?.noSell ?? [],
    holdAbove: data?.holdAbove ?? [],
    noTradeWindow: data?.noTradeWindow ?? [],
    agentGuardian: data?.agentGuardian ?? null,
    refresh: () => void mutate(),
  };
}
