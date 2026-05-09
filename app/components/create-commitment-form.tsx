"use client";

import { useState, useCallback } from "react";
import {
  address,
  type Address,
  type Instruction,
  type IAccountMeta,
  getProgramDerivedAddress,
  getAddressEncoder,
  getBase58Decoder,
} from "@solana/kit";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useCluster } from "./cluster-context";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROGRAM_ID: Address = address(
  "7s1UK1nQWK7CrNcaS576gbpMjMqrph1vArRepnQYLki7"
);
const TREASURY: Address = address(
  "mkzyaL8Xie6T3GHGrfCydeMk6JEajEWnkxrmjwZNgLJ"
);
const ACTIVATION_FEE_LAMPORTS = 1_000_000n; // 0.001 SOL
const SYSTEM_PROGRAM: Address = address(
  "11111111111111111111111111111111"
);

// Anchor discriminator for create_commitment (pre-verified)
const CREATE_COMMITMENT_DISC = new Uint8Array([
  0xe8, 0x1f, 0x76, 0x41, 0xe5, 0x02, 0x02, 0xaa,
]);

// ─── Types ────────────────────────────────────────────────────────────────────

type CommitmentTypeKey =
  | "NoBuy"
  | "NoSell"
  | "HoldAbove"
  | "HoldUntil"
  | "NoTradeWindow";

interface FormState {
  targetMint: string;
  stakeAmountSol: string;
  commitmentType: CommitmentTypeKey;
  durationDays: string;      // for NoBuy/NoSell/HoldAbove/NoTradeWindow
  threshold: string;         // HoldAbove: token amount
  unlockAt: string;          // HoldUntil: unix timestamp (seconds)
  startHour: string;         // NoTradeWindow: 0-23
  endHour: string;           // NoTradeWindow: 0-23
}

// ─── Instruction builders ────────────────────────────────────────────────────

function buildTransferInstruction(
  from: Address,
  to: Address,
  lamports: bigint
): Instruction {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);           // system transfer discriminator
  view.setBigUint64(4, lamports, true); // amount

  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: from, role: 3 } as IAccountMeta, // writable + signer
      { address: to, role: 1 } as IAccountMeta,   // writable
    ],
    data,
  };
}

function encodeCommitmentType(
  key: CommitmentTypeKey,
  threshold: string,
  unlockAt: string,
  startHour: string,
  endHour: string
): Uint8Array {
  switch (key) {
    case "NoBuy":
      return new Uint8Array([0]);
    case "NoSell":
      return new Uint8Array([1]);
    case "HoldAbove": {
      const bytes = new Uint8Array(9);
      bytes[0] = 2;
      new DataView(bytes.buffer).setBigUint64(
        1,
        BigInt(Math.round(parseFloat(threshold) * 1_000_000_000)),
        true
      );
      return bytes;
    }
    case "HoldUntil": {
      const bytes = new Uint8Array(9);
      bytes[0] = 3;
      new DataView(bytes.buffer).setBigInt64(
        1,
        BigInt(Math.round(parseFloat(unlockAt))),
        true
      );
      return bytes;
    }
    case "NoTradeWindow": {
      return new Uint8Array([
        4,
        Math.min(23, Math.max(0, parseInt(startHour, 10) || 0)),
        Math.min(23, Math.max(0, parseInt(endHour, 10) || 0)),
      ]);
    }
  }
}

async function deriveCommitmentPda(
  owner: Address,
  targetMint: Address
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [
      new TextEncoder().encode("commitment"),
      getAddressEncoder().encode(owner),
      getAddressEncoder().encode(targetMint),
    ],
  });
  return pda;
}

async function deriveVaultPda(commitmentPda: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [
      new TextEncoder().encode("vault"),
      getAddressEncoder().encode(commitmentPda),
    ],
  });
  return pda;
}

async function deriveProtocolStatePda(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode("protocol")],
  });
  return pda;
}

function buildCreateCommitmentInstruction(
  owner: Address,
  targetMint: Address,
  commitmentTypeBytes: Uint8Array,
  stakeLamports: bigint,
  durationSecs: number,
  guardianPubkey: Address | null,
  commitmentPda: Address,
  vaultPda: Address,
  protocolStatePda: Address
): Instruction {
  const decoder = getBase58Decoder();

  const stakeBytes = new Uint8Array(8);
  new DataView(stakeBytes.buffer).setBigUint64(0, stakeLamports, true);

  const durationBytes = new Uint8Array(4);
  new DataView(durationBytes.buffer).setUint32(0, durationSecs, true);

  let guardianBytes: Uint8Array;
  if (guardianPubkey === null) {
    guardianBytes = new Uint8Array([0]); // Option::None
  } else {
    const guardianArr = decoder.decode(guardianPubkey);
    guardianBytes = new Uint8Array([1, ...guardianArr]);
  }

  const data = new Uint8Array([
    ...CREATE_COMMITMENT_DISC,
    ...commitmentTypeBytes,
    ...stakeBytes,
    ...durationBytes,
    ...guardianBytes,
  ]);

  return {
    programAddress: PROGRAM_ID,
    accounts: [
      { address: owner, role: 3 } as IAccountMeta,              // owner: mut signer
      { address: targetMint, role: 0 } as IAccountMeta,         // target_mint: readonly
      { address: commitmentPda, role: 1 } as IAccountMeta,      // commitment_account: mut
      { address: vaultPda, role: 1 } as IAccountMeta,           // commitment_vault: mut
      { address: protocolStatePda, role: 1 } as IAccountMeta,   // protocol_state: mut
      { address: SYSTEM_PROGRAM, role: 0 } as IAccountMeta,     // system_program
    ],
    data,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const DEFAULT_FORM: FormState = {
  targetMint: "",
  stakeAmountSol: "0.01",
  commitmentType: "NoBuy",
  durationDays: "3",
  threshold: "0",
  unlockAt: "",
  startHour: "9",
  endHour: "17",
};

const DURATION_OPTIONS: Record<CommitmentTypeKey, { label: string; days: number }[]> = {
  NoBuy:         [{ label: "1d", days: 1 }, { label: "2d", days: 2 }, { label: "3d ★", days: 3 }],
  NoSell:        [{ label: "1d", days: 1 }, { label: "3d", days: 3 }, { label: "7d ★", days: 7 }],
  HoldAbove:     [{ label: "7d", days: 7 }, { label: "14d", days: 14 }, { label: "30d ★", days: 30 }],
  HoldUntil:     [],
  NoTradeWindow: [{ label: "7d", days: 7 }, { label: "14d", days: 14 }, { label: "30d ★", days: 30 }],
};

export function CreateCommitmentForm() {
  const { wallet, signer, status } = useWallet();
  const { send, isSending } = useSendTransaction();
  const { getExplorerUrl } = useCluster();

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [isProcessing, setIsProcessing] = useState(false);

  const walletAddress = wallet?.account.address;

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (!walletAddress || !signer) {
      toast.error("Please connect your wallet first.");
      return;
    }

    const targetMintStr = form.targetMint.trim();
    const stakeSOL = parseFloat(form.stakeAmountSol);

    if (!targetMintStr) {
      toast.error("Please enter a target mint address.");
      return;
    }
    if (isNaN(stakeSOL) || stakeSOL < 0.01) {
      toast.error("Minimum stake is 0.01 SOL.");
      return;
    }

    let targetMintAddr: Address;
    try {
      targetMintAddr = address(targetMintStr);
    } catch {
      toast.error("Invalid target mint address.");
      return;
    }

    // Compute duration_secs (required by contract, min 86400)
    let durationSecs: number;
    if (form.commitmentType === "HoldUntil") {
      const unlockTs = parseInt(form.unlockAt, 10);
      if (!unlockTs || unlockTs <= Math.floor(Date.now() / 1000)) {
        toast.error("Please select a future unlock date.");
        return;
      }
      durationSecs = Math.max(86400, unlockTs - Math.floor(Date.now() / 1000));
    } else {
      const days = parseFloat(form.durationDays);
      if (isNaN(days) || days < 1) {
        toast.error("Duration must be at least 1 day.");
        return;
      }
      durationSecs = Math.round(days * 86400);
    }

    // HoldAbove: threshold must be a positive number
    if (form.commitmentType === "HoldAbove") {
      const threshold = parseFloat(form.threshold);
      if (isNaN(threshold) || threshold <= 0) {
        toast.error("HoldAbove threshold must be greater than zero.");
        return;
      }
    }

    // NoTradeWindow: hours must be valid 0-23 integers and must differ
    if (form.commitmentType === "NoTradeWindow") {
      const sh = parseInt(form.startHour, 10);
      const eh = parseInt(form.endHour, 10);
      if (isNaN(sh) || isNaN(eh) || sh < 0 || sh > 23 || eh < 0 || eh > 23) {
        toast.error("Window hours must be between 0 and 23.");
        return;
      }
      if (sh === eh) {
        toast.error("Start and end hours must be different.");
        return;
      }
    }

    setIsProcessing(true);

    try {
      // ── Step 1: Call POST /api/commitment/create, expect 402 ──────────────

      toast.loading("Checking payment requirement...", { id: "commitment" });

      const initRes = await fetch("/api/commitment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: walletAddress,
          targetMint: targetMintStr,
          stakeAmountSol: stakeSOL,
          commitmentType: form.commitmentType,
        }),
      });

      if (initRes.status !== 402 && !initRes.ok) {
        const errBody = await initRes.text();
        throw new Error(`Server error (${initRes.status}): ${errBody}`);
      }

      // ── Step 2: Handle 402 — send SOL to treasury ─────────────────────────

      let paymentSig: string | undefined;

      if (initRes.status === 402) {
        toast.loading("Sending x402 micropayment (0.001 SOL)...", {
          id: "commitment",
        });

        const transferIx = buildTransferInstruction(
          walletAddress,
          TREASURY,
          ACTIVATION_FEE_LAMPORTS
        );

        paymentSig = await send({ instructions: [transferIx] });

        toast.loading("Payment sent! Verifying with server...", {
          id: "commitment",
        });

        // ── Step 3: Retry POST with X-Payment header ─────────────────────────

        const retryRes = await fetch("/api/commitment/create", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Payment": btoa(paymentSig),
          },
          body: JSON.stringify({
            owner: walletAddress,
            targetMint: targetMintStr,
            stakeAmountSol: stakeSOL,
            commitmentType: form.commitmentType,
          }),
        });

        if (!retryRes.ok) {
          const errBody = await retryRes.text();
          throw new Error(`Payment verification failed (${retryRes.status}): ${errBody}`);
        }

        const retryData = (await retryRes.json()) as { authorized?: boolean };
        if (!retryData.authorized) {
          throw new Error("Server did not authorize the commitment. Check payment.");
        }
      }

      // ── Step 4: Build + send create_commitment instruction ────────────────

      toast.loading("Deriving PDAs...", { id: "commitment" });

      const commitmentPda = await deriveCommitmentPda(walletAddress, targetMintAddr);
      const vaultPda = await deriveVaultPda(commitmentPda);
      const protocolStatePda = await deriveProtocolStatePda();

      const stakeLamports = BigInt(Math.round(stakeSOL * 1_000_000_000));
      const commitmentTypeBytes = encodeCommitmentType(
        form.commitmentType,
        form.threshold,
        form.unlockAt,
        form.startHour,
        form.endHour
      );

      const createIx = buildCreateCommitmentInstruction(
        walletAddress,
        targetMintAddr,
        commitmentTypeBytes,
        stakeLamports,
        durationSecs,
        null, // no guardian for now
        commitmentPda,
        vaultPda,
        protocolStatePda
      );

      toast.loading("Sending create_commitment transaction...", {
        id: "commitment",
      });

      const txSig = await send({ instructions: [createIx] });

      // ── Step 5: Success ───────────────────────────────────────────────────

      toast.success("Commitment created!", {
        id: "commitment",
        description: (
          <a
            href={getExplorerUrl(`/tx/${txSig}`)}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            View transaction
          </a>
        ),
      });

      setForm(DEFAULT_FORM);
    } catch (err) {
      console.error("CreateCommitment failed:", err);
      toast.error(
        err instanceof Error ? err.message : "An unexpected error occurred.",
        { id: "commitment" }
      );
    } finally {
      setIsProcessing(false);
    }
  }, [walletAddress, signer, form, send, getExplorerUrl]);

  const busy = isSending || isProcessing;

  // ─── Not connected ─────────────────────────────────────────────────────────

  if (status !== "connected") {
    return (
      <section className="w-full space-y-4 rounded-2xl border border-border-low bg-card p-6 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.35)]">
        <div className="space-y-1">
          <p className="text-lg font-semibold">Create Commitment</p>
          <p className="text-sm text-muted">
            Connect your wallet to stake SOL and commit to a trading restriction.
          </p>
        </div>
        <div className="rounded-lg bg-cream/50 p-4 text-center text-sm text-muted">
          Wallet not connected
        </div>
      </section>
    );
  }

  // ─── Main form ─────────────────────────────────────────────────────────────

  return (
    <section className="w-full space-y-5 rounded-2xl border border-border-low bg-card p-6 shadow-[0_20px_80px_-50px_rgba(0,0,0,0.35)]">
      {/* Header */}
      <div className="space-y-1">
        <p className="text-lg font-semibold">Create Commitment</p>
        <p className="text-sm text-muted">
          Stake SOL and commit to NOT trading a specific token. Violators get
          slashed; compliant stakers earn yield.
        </p>
      </div>

      {/* Target Mint */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted">
          Target Mint Address
        </label>
        <input
          type="text"
          placeholder="Token mint you are committing to avoid"
          value={form.targetMint}
          onChange={(e) => setField("targetMint", e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 font-mono text-sm outline-none transition placeholder:text-muted/60 focus:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
        />
      </div>

      {/* Stake Amount */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted">
          Stake Amount (SOL)
        </label>
        <input
          type="number"
          min="0.001"
          step="0.001"
          placeholder="e.g. 0.05"
          value={form.stakeAmountSol}
          onChange={(e) => setField("stakeAmountSol", e.target.value)}
          disabled={busy}
          className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted/60 focus:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
        />
      </div>

      {/* Commitment Type */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted">
          Commitment Type
        </label>
        <select
          value={form.commitmentType}
          onChange={(e) =>
            setField("commitmentType", e.target.value as CommitmentTypeKey)
          }
          disabled={busy}
          className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition focus:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
        >
          <option value="NoBuy">NoBuy — never buy this token</option>
          <option value="NoSell">NoSell — never sell this token</option>
          <option value="HoldAbove">HoldAbove — keep balance above threshold</option>
          <option value="HoldUntil">HoldUntil — hold until a specific time</option>
          <option value="NoTradeWindow">NoTradeWindow — no trading in a daily window</option>
        </select>
      </div>

      {/* Type-specific parameters */}
      {form.commitmentType === "HoldAbove" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted">
            Minimum Balance Threshold (SOL)
          </label>
          <input
            type="number"
            min="0"
            step="0.001"
            placeholder="e.g. 1.0"
            value={form.threshold}
            onChange={(e) => setField("threshold", e.target.value)}
            disabled={busy}
            className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted/60 focus:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
          />
        </div>
      )}

      {form.commitmentType === "HoldUntil" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted">
            Unlock Date &amp; Time
          </label>
          <input
            type="datetime-local"
            value={form.unlockAt}
            onChange={(e) => {
              const ts = e.target.value
                ? Math.floor(new Date(e.target.value).getTime() / 1000).toString()
                : "";
              setField("unlockAt", ts);
            }}
            disabled={busy}
            className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition focus:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
          />
          {form.unlockAt && (
            <p className="text-xs text-muted">
              Unix timestamp: {form.unlockAt}
            </p>
          )}
        </div>
      )}

      {form.commitmentType === "NoTradeWindow" && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted">
              Window Start Hour (0–23)
            </label>
            <input
              type="number"
              min="0"
              max="23"
              step="1"
              value={form.startHour}
              onChange={(e) => setField("startHour", e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition focus:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted">
              Window End Hour (0–23)
            </label>
            <input
              type="number"
              min="0"
              max="23"
              step="1"
              value={form.endHour}
              onChange={(e) => setField("endHour", e.target.value)}
              disabled={busy}
              className="w-full rounded-lg border border-border-low bg-card px-4 py-2.5 text-sm outline-none transition focus:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {/* Duration (not shown for HoldUntil, which uses unlock date instead) */}
      {form.commitmentType !== "HoldUntil" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wide text-muted">
            Duration (days)
          </label>
          <div className="flex gap-2 flex-wrap">
            {(DURATION_OPTIONS[form.commitmentType] ?? []).map((opt) => (
              <button
                key={opt.days}
                type="button"
                onClick={() => setField("durationDays", String(opt.days))}
                disabled={busy}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition border disabled:pointer-events-none disabled:opacity-50 ${
                  form.durationDays === String(opt.days)
                    ? "border-foreground/40 bg-foreground/10 text-foreground"
                    : "border-border-low bg-card text-muted hover:border-foreground/20"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <input
              type="number"
              min="1"
              step="1"
              value={form.durationDays}
              onChange={(e) => setField("durationDays", e.target.value)}
              disabled={busy}
              className="w-20 rounded-md border border-border-low bg-card px-3 py-1.5 text-xs outline-none transition focus:border-foreground/30 disabled:pointer-events-none disabled:opacity-50"
            />
          </div>
        </div>
      )}

      {/* x402 info banner */}
      <div className="rounded-lg border border-border-low bg-cream/30 px-4 py-3 text-xs text-muted">
        <span className="font-semibold text-foreground/80">x402 payment required:</span>{" "}
        Creating a commitment costs{" "}
        <span className="font-semibold text-foreground/80">0.001 SOL</span> paid to
        the protocol treasury. This is verified server-side before the on-chain
        instruction is authorised.
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={busy || !form.targetMint.trim()}
        className="w-full rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground shadow-xs transition hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? "Processing..." : "Create Commitment"}
      </button>
    </section>
  );
}
