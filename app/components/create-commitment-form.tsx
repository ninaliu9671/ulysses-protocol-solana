"use client";

import { useEffect, useMemo, useState } from "react";
import { address, type Address, type AccountRole } from "@solana/kit";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet/context";
import { useSendTransaction } from "../lib/hooks/use-send-transaction";
import { useProtocolMetrics } from "../lib/hooks/use-protocol-metrics";
import { useUserCommitments } from "../lib/hooks/use-user-commitments";
import { useCluster } from "./cluster-context";
import { getClusterUrl } from "../lib/solana-client";
import { rpcCall } from "../lib/rpc";
import {
  getCreateNoSellInstructionAsync,
  getCreateHoldAboveInstructionAsync,
  getCreateNoTradeWindowInstructionAsync,
  getCreateAgentGuardianInstructionAsync,
  findNoSellPdaPda,
  findCreateHoldAboveCommitmentPda,
  findCreateNoTradeWindowCommitmentPda,
  findCommitmentPda,
} from "../generated/vault";
import { COMMITMENT_TYPES, TYPE_BY_KEY, type CommitmentTypeKey } from "../lib/commitment-types";
import { saveCachedCommitment } from "../lib/my-commitments-cache";
import { displaySolToLamports } from "../lib/lamports";


const LAMPORTS_PER_SOL = 1_000_000_000n;

// integer sqrt for u128 (matches on-chain math.rs)
function integerSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("neg");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

// Fetches all SPL token accounts owned by `owner` for `mint`. Returns the
// list of token-account pubkeys, used as remaining_accounts so the program
// can sum them as the baseline for NoSell / HoldAbove. Empty array signals
// the wallet holds zero of this token (program will reject as BaselineZero).
async function fetchOwnerTokenAccounts(
  rpcUrl: string,
  owner: string,
  mint: string,
): Promise<string[]> {
  const result = await rpcCall<{
    value: { pubkey: string }[];
  }>(
    rpcUrl,
    "getTokenAccountsByOwner",
    [owner, { mint }, { encoding: "base64" }],
  );
  return (result?.value ?? []).map((v) => v.pubkey);
}

// Fetch mint decimals so we can convert user-friendly token counts ("7000")
// into raw on-chain units (7000 * 10^6 for a 6-decimal mint).
async function fetchMintDecimals(rpcUrl: string, mint: string): Promise<number> {
  const res = await rpcCall<{
    value: { data: { parsed: { info: { decimals: number } } } } | null;
  }>(
    rpcUrl,
    "getAccountInfo",
    [mint, { encoding: "jsonParsed" }],
  );
  const d = res?.value?.data?.parsed?.info?.decimals;
  if (typeof d !== "number") throw new Error("Could not read mint decimals — is this a real mint address?");
  return d;
}

export function CreateCommitmentForm() {
  const { signer } = useWallet();
  const walletAddress = signer?.address;
  const { send, isSending } = useSendTransaction();
  const metrics = useProtocolMetrics();
  const userCommits = useUserCommitments(walletAddress);
  const { cluster } = useCluster();
  const rpcUrl = getClusterUrl(cluster);

  const [type, setType] = useState<CommitmentTypeKey>("NoSell");
  const [targetMint, setTargetMint] = useState("");
  const [durMonths, setDurMonths] = useState("");
  const [durDays, setDurDays] = useState("30");
  const [durHours, setDurHours] = useState("");
  const [durMinutes, setDurMinutes] = useState("");
  const [stakeSol, setStakeSol] = useState("500");
  const [floorAmount, setFloorAmount] = useState("");
  const [windowStart, setWindowStart] = useState("2");
  const [windowEnd, setWindowEnd] = useState("5");
  const [guardian, setGuardian] = useState("");

  const durationSeconds = useMemo(() => {
    const m = parseInt(durMonths, 10) || 0;
    const d = parseInt(durDays, 10) || 0;
    const h = parseInt(durHours, 10) || 0;
    const min = parseInt(durMinutes, 10) || 0;
    return m * 30 * 86400 + d * 86400 + h * 3600 + min * 60;
  }, [durMonths, durDays, durHours, durMinutes]);

  // Derived: weight + share
  const weight = useMemo(() => {
    try {
      const stakeLamports = displaySolToLamports(parseFloat(stakeSol));
      const secs = BigInt(durationSeconds);
      if (stakeLamports <= 0n || secs <= 0n) return 0n;
      return integerSqrt(stakeLamports * secs);
    } catch {
      return 0n;
    }
  }, [stakeSol, durationSeconds]);

  const networkTotal = metrics?.totalWeight ?? 0n;
  const sharePct = useMemo(() => {
    if (networkTotal === 0n) return weight > 0n ? 100 : 0;
    const totalAfter = networkTotal + weight;
    if (totalAfter === 0n) return 0;
    return Number((weight * 10000n) / totalAfter) / 100;
  }, [weight, networkTotal]);

  // Conflict check (FRONTEND.md §11.5.2)
  const conflictMessage = useMemo<string | null>(() => {
    if (!userCommits) return null;
    const has = userCommits;
    if (has.agentGuardian) {
      return "You have an active AgentGuardian. Cancel it before creating any other commitment.";
    }
    if (type === "AgentGuardian" && (has.noSell.length || has.holdAbove.length || has.noTradeWindow.length)) {
      return "AgentGuardian requires no other active commitments. Cancel them first.";
    }
    if (type === "NoSell" || type === "HoldAbove") {
      if (!targetMint) return null;
      const same = (c: { targetMint: string }) => c.targetMint === targetMint;
      const conflictNoSell = has.noSell.find(same);
      const conflictHoldAbove = has.holdAbove.find(same);
      if (type === "NoSell" && conflictNoSell) return "You already have a NoSell on this token.";
      if (type === "HoldAbove" && conflictHoldAbove) return "You already have a HoldAbove on this token.";
      if (type === "HoldAbove" && conflictNoSell) {
        return "NoSell on this token already covers HoldAbove. Cancel NoSell to downgrade.";
      }
    }
    return null;
  }, [userCommits, type, targetMint]);

  // Local time preview for NoTradeWindow
  const windowLocalPreview = useMemo(() => {
    if (type !== "NoTradeWindow") return null;
    const s = parseInt(windowStart, 10);
    const e = parseInt(windowEnd, 10);
    if (isNaN(s) || isNaN(e)) return null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offsetH = -new Date().getTimezoneOffset() / 60;
    const ls = ((s + offsetH) % 24 + 24) % 24;
    const le = ((e + offsetH) % 24 + 24) % 24;
    return `Local (${tz}): ${String(ls).padStart(2, "0")}:00 → ${String(le).padStart(2, "0")}:00${ls > le ? " (crosses midnight)" : ""}`;
  }, [type, windowStart, windowEnd]);

  const windowInvalid =
    type === "NoTradeWindow" && (windowStart === "" || windowEnd === "" || windowStart === windowEnd);

  const canSubmit = !!signer && !conflictMessage && !isSending && !windowInvalid;

  async function handleSubmit() {
    if (!signer) {
      toast.error("Connect wallet first");
      return;
    }
    try {
      const stakeLamports = displaySolToLamports(parseFloat(stakeSol));
      if (stakeLamports < 10_000_000n) throw new Error("Minimum stake is 100 SOL");
      const secs = durationSeconds;
      if (!secs || secs < 60 || secs > 31_536_000) throw new Error("Duration must be 1 minute – 365 days");

      let ix;
      // Capture-once values needed both for ix construction and for the
      // post-success cache write (so PDA derivation matches).
      const nonceForCache: bigint = BigInt(Date.now());
      switch (type) {
        case "NoSell": {
          if (!targetMint) throw new Error("Target mint required");
          const tokenAccounts = await fetchOwnerTokenAccounts(
            rpcUrl,
            signer.address,
            targetMint,
          );
          if (tokenAccounts.length === 0) {
            throw new Error("You hold zero of this token. Get some first or pick a different mint.");
          }
          const baseIx = await getCreateNoSellInstructionAsync({
            owner: signer,
            targetMint: address(targetMint),
            stakeAmount: stakeLamports,
            durationSeconds: secs,
          });
          ix = {
            ...baseIx,
            accounts: [
              ...baseIx.accounts,
              ...tokenAccounts.map((pk) => ({
                address: address(pk),
                role: 0 as AccountRole, // ReadonlyAccount
              })),
            ],
          };
          break;
        }
        case "HoldAbove": {
          if (!targetMint) throw new Error("Target mint required");
          const floorTokens = parseFloat(floorAmount || "0");
          if (!(floorTokens > 0)) throw new Error("Floor amount required");
          const decimals = await fetchMintDecimals(rpcUrl, targetMint);
          const floorBig = BigInt(Math.floor(floorTokens * 10 ** decimals));
          const tokenAccounts = await fetchOwnerTokenAccounts(
            rpcUrl,
            signer.address,
            targetMint,
          );
          if (tokenAccounts.length === 0) {
            throw new Error("You hold zero of this token. Get some first or pick a different mint.");
          }
          const baseIx = await getCreateHoldAboveInstructionAsync({
            owner: signer,
            targetMint: address(targetMint),
            stakeAmount: stakeLamports,
            durationSeconds: secs,
            floorAmount: floorBig,
          });
          ix = {
            ...baseIx,
            accounts: [
              ...baseIx.accounts,
              ...tokenAccounts.map((pk) => ({
                address: address(pk),
                role: 0 as AccountRole,
              })),
            ],
          };
          break;
        }
        case "NoTradeWindow": {
          const sh = parseInt(windowStart, 10);
          const eh = parseInt(windowEnd, 10);
          if (sh < 0 || sh > 23 || eh < 0 || eh > 23) throw new Error("Hours must be 0-23");
          if (sh === eh) throw new Error("Window cannot be 0 hours");
          ix = await getCreateNoTradeWindowInstructionAsync({
            owner: signer,
            stakeAmount: stakeLamports,
            durationSeconds: secs,
            windowStartHour: sh,
            windowEndHour: eh,
            nonce: nonceForCache,
          });
          break;
        }
        case "AgentGuardian": {
          if (!guardian) throw new Error("Guardian pubkey required");
          ix = await getCreateAgentGuardianInstructionAsync({
            owner: signer,
            stakeAmount: stakeLamports,
            durationSeconds: secs,
            guardianPubkey: address(guardian) as Address,
          });
          break;
        }
      }
      const sig = await send({ instructions: [ix] });
      toast.success(`Commitment created: ${sig.slice(0, 8)}…`);

      // Cache the commitment so my-commitments can still display it after
      // it terminates (Slashed/Cancelled/Claimed close the on-chain account).
      try {
        const owner = signer.address;
        const nowSec = Math.floor(Date.now() / 1000);
        let pubkey: string | null = null;
        const baseCache = {
          owner,
          stakeLamports: stakeLamports.toString(),
          durationSeconds: secs,
          createdAt: nowSec,
        };
        if (type === "NoSell") {
          const [pda] = await findNoSellPdaPda({ owner, targetMint: address(targetMint) });
          pubkey = pda;
          saveCachedCommitment({ ...baseCache, pubkey, type, targetMint });
        } else if (type === "HoldAbove") {
          const [pda] = await findCreateHoldAboveCommitmentPda({ owner, targetMint: address(targetMint) });
          pubkey = pda;
          saveCachedCommitment({
            ...baseCache,
            pubkey,
            type,
            targetMint,
            floorAmount: BigInt(Math.floor(parseFloat(floorAmount || "0"))).toString(),
          });
        } else if (type === "NoTradeWindow") {
          const sh = parseInt(windowStart, 10);
          const eh = parseInt(windowEnd, 10);
          const [pda] = await findCreateNoTradeWindowCommitmentPda({ owner, nonce: nonceForCache });
          pubkey = pda;
          saveCachedCommitment({
            ...baseCache,
            pubkey,
            type,
            windowStartHour: sh,
            windowEndHour: eh,
            nonce: nonceForCache.toString(),
          });
        } else if (type === "AgentGuardian") {
          const [pda] = await findCommitmentPda({ owner });
          pubkey = pda;
          saveCachedCommitment({
            ...baseCache,
            pubkey,
            type,
            guardianPubkey: guardian,
          });
        }
      } catch {
        /* cache best-effort; failure here doesn't affect the on-chain commitment */
      }

      userCommits.refresh?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  }

  return (
    <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <h3 className="text-lg font-bold mb-4" style={{ color: "var(--gold)" }}>
        Create Commitment
      </h3>

      {/* Type */}
      <Field label="COMMITMENT TYPE">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CommitmentTypeKey)}
          className="w-full px-3 py-2 rounded"
          style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        >
          {COMMITMENT_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.emoji} {t.label} — {t.tagline}</option>
          ))}
        </select>
      </Field>

      {/* Target / per-type fields */}
      {(type === "NoSell" || type === "HoldAbove") && (
        <Field label="TARGET MINT ADDRESS">
          <input
            value={targetMint}
            onChange={(e) => setTargetMint(e.target.value.trim())}
            placeholder="Mint pubkey"
            className="w-full px-3 py-2 rounded font-mono text-sm"
            style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>
      )}
      {type === "HoldAbove" && (
        <Field label="FLOOR AMOUNT (in tokens, must be > 0 and ≤ your current balance)">
          <input
            value={floorAmount}
            onChange={(e) => setFloorAmount(e.target.value.trim())}
            placeholder="e.g. 7000"
            className="w-full px-3 py-2 rounded"
            style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>
      )}
      {type === "NoTradeWindow" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="WINDOW START HOUR (UTC, 0-23)">
              <input
                type="number"
                min={0}
                max={23}
                step={1}
                value={windowStart}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  if (v === "") return setWindowStart("");
                  const n = Math.max(0, Math.min(23, parseInt(v, 10)));
                  setWindowStart(String(n));
                }}
                className="w-full px-3 py-2 rounded"
                style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
              />
            </Field>
            <Field label="WINDOW END HOUR (UTC, exclusive, 0-23)">
              <input
                type="number"
                min={0}
                max={23}
                step={1}
                value={windowEnd}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, "");
                  if (v === "") return setWindowEnd("");
                  const n = Math.max(0, Math.min(23, parseInt(v, 10)));
                  setWindowEnd(String(n));
                }}
                className="w-full px-3 py-2 rounded"
                style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
              />
            </Field>
          </div>
          {windowLocalPreview && (
            <div className="text-xs mb-3" style={{ color: "var(--muted)" }}>{windowLocalPreview}</div>
          )}
          {windowStart !== "" && windowEnd !== "" && windowStart === windowEnd && (
            <div className="text-xs mb-3" style={{ color: "#fca5a5" }}>Window cannot be 0 hours (start = end).</div>
          )}
        </>
      )}
      {type === "AgentGuardian" && (
        <Field label="GUARDIAN PUBKEY (only this key may move funds)">
          <input
            value={guardian}
            onChange={(e) => setGuardian(e.target.value.trim())}
            placeholder="Guardian wallet address"
            className="w-full px-3 py-2 rounded font-mono text-sm"
            style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
          />
        </Field>
      )}

      {/* Duration */}
      <Field label="DURATION">
        <div className="flex items-center gap-2 flex-wrap">
          {([
            { value: durMonths, set: setDurMonths, label: "months" },
            { value: durDays,   set: setDurDays,   label: "days" },
            { value: durHours,  set: setDurHours,  label: "hours" },
            { value: durMinutes, set: setDurMinutes, label: "minutes" },
          ] as const).map(({ value, set, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <input
                value={value}
                onChange={(e) => set(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="0"
                className="w-14 px-2 py-1 rounded text-sm text-center"
                style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
              />
              <span className="text-xs" style={{ color: "var(--muted)" }}>{label}</span>
            </div>
          ))}
        </div>
      </Field>

      {/* Stake */}
      <Field label="STAKE AMOUNT (SOL, ≥ 100)">
        <input
          value={stakeSol}
          onChange={(e) => setStakeSol(e.target.value.trim())}
          className="w-full px-3 py-2 rounded"
          style={{ background: "var(--input)", color: "var(--foreground)", border: "1px solid var(--border)" }}
        />
        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
          Your weight: <span style={{ color: "var(--gold)" }}>{weight.toString()}</span> · Network total:{" "}
          {networkTotal.toString()} · Your share:{" "}
          <span style={{ color: "var(--gold)" }}>{sharePct.toFixed(2)}%</span>
        </div>
      </Field>

      {conflictMessage && (
        <div className="text-sm mb-3 px-3 py-2 rounded" style={{ background: "rgba(220,38,38,0.1)", color: "#fca5a5", border: "1px solid rgba(220,38,38,0.4)" }}>
          ⚠ {conflictMessage}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full py-2.5 rounded font-bold text-sm transition-opacity"
        style={{
          background: "var(--gold)",
          color: "var(--background)",
          opacity: canSubmit ? 1 : 0.4,
          cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {isSending ? "Submitting…" : "Create Commitment"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] font-bold mb-1.5" style={{ color: "var(--muted)", letterSpacing: "0.1em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
