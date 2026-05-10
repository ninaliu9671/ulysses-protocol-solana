"use client";

import { useState, useCallback, useMemo } from "react";
import { useSWRConfig } from "swr";
import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
} from "@solana/kit";
import { getSetComputeUnitLimitInstruction } from "@solana-program/compute-budget";
import { useWallet } from "../wallet/context";
import { useCluster } from "../../components/cluster-context";
import { getClusterUrl, getClusterWsConfig } from "../solana-client";

// Bypass kit-client-rpc's transaction planner because it always runs a
// simulateTransaction call to estimate compute units, which on the public
// devnet RPC gets 429-throttled and fails the whole flow. We set our own
// fixed compute unit limit (400_000 — comfortable cushion for our heaviest
// instruction) and send the wire bytes directly to sendTransaction RPC.

export function useSendTransaction() {
  const { signer } = useWallet();
  const { cluster } = useCluster();
  const { mutate } = useSWRConfig();
  const [isSending, setIsSending] = useState(false);

  const rpc = useMemo(() => createSolanaRpc(getClusterUrl(cluster)), [cluster]);
  const rpcSubscriptions = useMemo(() => {
    const wsConfig = getClusterWsConfig(cluster);
    if (!wsConfig) {
      return createSolanaRpcSubscriptions(
        getClusterUrl(cluster).replace(/^http/, "ws"),
      );
    }
    return createSolanaRpcSubscriptions(wsConfig.url);
  }, [cluster]);

  const sendAndConfirm = useMemo(
    () => sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions }),
    [rpc, rpcSubscriptions],
  );

  const send = useCallback(
    async ({ instructions }: { instructions: readonly Instruction[] }) => {
      if (!signer) throw new Error("Wallet not connected");
      setIsSending(true);
      try {
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
        const computeBudgetIx = getSetComputeUnitLimitInstruction({ units: 400_000 });

        const message = pipe(
          createTransactionMessage({ version: 0 }),
          (m) => setTransactionMessageFeePayerSigner(signer, m),
          (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
          (m) => appendTransactionMessageInstructions([computeBudgetIx, ...instructions], m),
        );

        const signedTx = await signTransactionMessageWithSigners(message);

        // sendAndConfirmTransactionFactory submits with skipPreflight=false by
        // default; we set it true since we already trust our own CU limit and
        // want to avoid one more simulate call against the throttled RPC.
        await sendAndConfirm(
          signedTx as Parameters<typeof sendAndConfirm>[0],
          { commitment: "confirmed", skipPreflight: true },
        );

        const signature = getSignatureFromTransaction(signedTx);
        mutate((key: unknown) => Array.isArray(key) && key[0] === "balance");
        return signature;
      } finally {
        setIsSending(false);
      }
    },
    [signer, rpc, sendAndConfirm, mutate],
  );

  return { send, isSending };
}
