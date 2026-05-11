// Anchor event log parser.
// Anchor emits events as `Program data: <base64>` log lines, where the
// decoded bytes are: 8-byte event discriminator (sha256("event:<Name>")[0:8])
// + Borsh-encoded fields.

import { base64ToBytes, rpcCall } from "./rpc";
import { VAULT_PROGRAM_ADDRESS } from "../generated/vault";

async function eventDiscriminator(name: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(`event:${name}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash).slice(0, 8);
}

const cachedDisc: { slashed?: Uint8Array; created?: Uint8Array; claimed?: Uint8Array; cancelled?: Uint8Array } = {};
async function getSlashedDisc(): Promise<Uint8Array> {
  if (!cachedDisc.slashed) cachedDisc.slashed = await eventDiscriminator("Slashed");
  return cachedDisc.slashed;
}
async function getClaimedDisc(): Promise<Uint8Array> {
  if (!cachedDisc.claimed) cachedDisc.claimed = await eventDiscriminator("Claimed");
  return cachedDisc.claimed;
}
async function getCancelledDisc(): Promise<Uint8Array> {
  if (!cachedDisc.cancelled) cachedDisc.cancelled = await eventDiscriminator("Cancelled");
  return cachedDisc.cancelled;
}

function readU64LE(b: Uint8Array, o: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(b[o + i]) << BigInt(8 * i);
  return v;
}

function readI64LE(b: Uint8Array, o: number): number {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(b[o + i]) << BigInt(8 * i);
  if (v >= 0x8000000000000000n) v -= 0x10000000000000000n;
  return Number(v);
}

function typeDiscToKey(disc: number): "NoSell" | "HoldAbove" | "NoTradeWindow" | "AgentGuardian" | "Unknown" {
  return (["NoSell", "HoldAbove", "NoTradeWindow", "AgentGuardian"] as const)[disc] ?? "Unknown";
}

// Bytes32 → base58 (for pubkey reconstruction)
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export function bytes32ToBase58(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) num = (num << 8n) | BigInt(b);
  if (num === 0n) return "1".repeat(bytes.length);
  const parts: string[] = [];
  while (num > 0n) {
    parts.unshift(B58[Number(num % 58n)]);
    num /= 58n;
  }
  let leading = 0;
  for (const b of bytes) {
    if (b === 0) leading++;
    else break;
  }
  return "1".repeat(leading) + parts.join("");
}

function eq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Byte layout for Slashed / Cancelled (post-upgrade):
//   [0:8]   discriminator
//   [8:40]  commitment (Pubkey)
//   [40:72] owner (Pubkey)
//   [72:80] principal (u64)
//   [80]    type_disc (u8)
//   [81:113] target_mint (Pubkey)
//   [113:121] created_at (i64)
//   [121:129] expires_at (i64)
//
// Byte layout for Claimed (post-upgrade):
//   [0:8]   discriminator
//   [8:40]  commitment
//   [40:72] owner
//   [72:80] principal (u64)
//   [80:88] yield_paid (u64)
//   [88]    type_disc (u8)
//   [89:121] target_mint (Pubkey)
//   [121:129] created_at (i64)
//   [129:137] expires_at (i64)

export type SlashedEvent = {
  kind: "Slashed" | "Cancelled";
  signature: string;
  blockTime: number | null;
  commitment: string;
  owner: string;
  principal: bigint;
  commitmentType: "NoSell" | "HoldAbove" | "NoTradeWindow" | "AgentGuardian" | "Unknown";
  targetMint: string | null;
  createdAt: number | null;
  expiresAt: number | null;
};

type SignatureInfo = { signature: string; blockTime: number | null; err: unknown };
type TxMeta = {
  meta: { logMessages?: string[] | null } | null;
  blockTime: number | null;
};

/**
 * Fetch recent Slashed + Cancelled events emitted by the vault program.
 * @param limit Max events to return (we'll scan up to 100 sigs).
 */
export async function fetchSlashedEvents(
  rpcUrl: string,
  limit: number,
): Promise<SlashedEvent[]> {
  const [slashedDisc, cancelledDisc] = await Promise.all([getSlashedDisc(), getCancelledDisc()]);
  const sigs = await rpcCall<SignatureInfo[]>(rpcUrl, "getSignaturesForAddress", [
    VAULT_PROGRAM_ADDRESS,
    { limit: 500 },
  ]);
  if (!sigs?.length) return [];

  const events: SlashedEvent[] = [];
  const BATCH = 3;
  for (let i = 0; i < sigs.length && events.length < limit; i += BATCH) {
    const batch = sigs.slice(i, i + BATCH);
    const txs = await Promise.all(
      batch.map((s) =>
        rpcCall<TxMeta>(rpcUrl, "getTransaction", [
          s.signature,
          { encoding: "json", maxSupportedTransactionVersion: 0 },
        ]).catch(() => null),
      ),
    );
    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      if (!tx?.meta?.logMessages) continue;
      for (const log of tx.meta.logMessages) {
        const m = log.match(/^Program data: (.+)$/);
        if (!m) continue;
        const bytes = base64ToBytes(m[1]);
        if (bytes.length < 80) continue;
        let kind: "Slashed" | "Cancelled" | null = null;
        if (eq(bytes.slice(0, 8), slashedDisc)) kind = "Slashed";
        else if (eq(bytes.slice(0, 8), cancelledDisc)) kind = "Cancelled";
        if (!kind) continue;
        const commitment = bytes32ToBase58(bytes.slice(8, 40));
        const owner = bytes32ToBase58(bytes.slice(40, 72));
        const principal = readU64LE(bytes, 72);
        const hasNewFields = bytes.length >= 129;
        const commitmentType = hasNewFields ? typeDiscToKey(bytes[80]) : "Unknown";
        const targetMint = hasNewFields ? bytes32ToBase58(bytes.slice(81, 113)) : null;
        const createdAt = hasNewFields ? readI64LE(bytes, 113) : null;
        const expiresAt = hasNewFields ? readI64LE(bytes, 121) : null;
        events.push({
          kind,
          signature: batch[j].signature,
          blockTime: tx.blockTime,
          commitment,
          owner,
          principal,
          commitmentType,
          targetMint,
          createdAt,
          expiresAt,
        });
      }
    }
  }
  return events.slice(0, limit);
}

/**
 * Termination event covers Slashed / Cancelled / Claimed.
 * Post-upgrade events include type_disc, target_mint, created_at, expires_at.
 * Pre-upgrade events have only commitment/owner/principal (backward compat: new fields null).
 */
export type TerminationKind = "Slashed" | "Cancelled" | "Claimed";

export type TerminationEvent = {
  kind: TerminationKind;
  signature: string;
  blockTime: number | null;
  commitment: string;
  owner: string;
  principal: bigint;
  yieldPaid?: bigint;
  commitmentType: "NoSell" | "HoldAbove" | "NoTradeWindow" | "AgentGuardian" | "Unknown";
  targetMint: string | null;
  createdAt: number | null;
  expiresAt: number | null;
};

export async function fetchTerminationEventsForOwner(
  rpcUrl: string,
  owner: string,
  limit = 200,
): Promise<TerminationEvent[]> {
  const [slashedDisc, cancelledDisc, claimedDisc] = await Promise.all([
    getSlashedDisc(),
    getCancelledDisc(),
    getClaimedDisc(),
  ]);

  const sigs = await rpcCall<SignatureInfo[]>(rpcUrl, "getSignaturesForAddress", [
    owner,
    { limit },
  ]);
  if (!sigs?.length) return [];

  const events: TerminationEvent[] = [];
  const BATCH = 3;
  for (let i = 0; i < sigs.length; i += BATCH) {
    const batch = sigs.slice(i, i + BATCH);
    const txs = await Promise.all(
      batch.map((s) =>
        rpcCall<TxMeta>(rpcUrl, "getTransaction", [
          s.signature,
          { encoding: "json", maxSupportedTransactionVersion: 0 },
        ]).catch(() => null),
      ),
    );
    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      if (!tx?.meta?.logMessages) continue;
      for (const log of tx.meta.logMessages) {
        const m = log.match(/^Program data: (.+)$/);
        if (!m) continue;
        const bytes = base64ToBytes(m[1]);
        if (bytes.length < 80) continue;
        let kind: TerminationKind | null = null;
        if (eq(bytes.slice(0, 8), slashedDisc)) kind = "Slashed";
        else if (eq(bytes.slice(0, 8), cancelledDisc)) kind = "Cancelled";
        else if (eq(bytes.slice(0, 8), claimedDisc)) kind = "Claimed";
        if (!kind) continue;
        const commitment = bytes32ToBase58(bytes.slice(8, 40));
        const ownerInEvent = bytes32ToBase58(bytes.slice(40, 72));
        if (ownerInEvent !== owner) continue;
        const principal = readU64LE(bytes, 72);

        if (kind === "Claimed") {
          // Claimed: yield_paid at [80:88], new fields start at [88]
          const yieldPaid = bytes.length >= 88 ? readU64LE(bytes, 80) : undefined;
          const hasNewFields = bytes.length >= 137;
          const commitmentType = hasNewFields ? typeDiscToKey(bytes[88]) : "Unknown";
          const targetMint = hasNewFields ? bytes32ToBase58(bytes.slice(89, 121)) : null;
          const createdAt = hasNewFields ? readI64LE(bytes, 121) : null;
          const expiresAt = hasNewFields ? readI64LE(bytes, 129) : null;
          events.push({
            kind,
            signature: batch[j].signature,
            blockTime: tx.blockTime,
            commitment,
            owner: ownerInEvent,
            principal,
            yieldPaid,
            commitmentType,
            targetMint,
            createdAt,
            expiresAt,
          });
        } else {
          // Slashed / Cancelled: new fields start at [80]
          const hasNewFields = bytes.length >= 129;
          const commitmentType = hasNewFields ? typeDiscToKey(bytes[80]) : "Unknown";
          const targetMint = hasNewFields ? bytes32ToBase58(bytes.slice(81, 113)) : null;
          const createdAt = hasNewFields ? readI64LE(bytes, 113) : null;
          const expiresAt = hasNewFields ? readI64LE(bytes, 121) : null;
          events.push({
            kind,
            signature: batch[j].signature,
            blockTime: tx.blockTime,
            commitment,
            owner: ownerInEvent,
            principal,
            commitmentType,
            targetMint,
            createdAt,
            expiresAt,
          });
        }
      }
    }
  }
  return events;
}

export type ClaimedEventGlobal = {
  signature: string;
  owner: string;
  principal: bigint;
  yieldPaid: bigint;
};

export async function fetchClaimedEventsGlobal(rpcUrl: string, limit = 100): Promise<ClaimedEventGlobal[]> {
  const claimedDisc = await getClaimedDisc();
  const sigs = await rpcCall<SignatureInfo[]>(rpcUrl, "getSignaturesForAddress", [
    VAULT_PROGRAM_ADDRESS,
    { limit: 500 },
  ]);
  if (!sigs?.length) return [];

  const events: ClaimedEventGlobal[] = [];
  const BATCH = 3;
  for (let i = 0; i < sigs.length && events.length < limit; i += BATCH) {
    const batch = sigs.slice(i, i + BATCH);
    const txs = await Promise.all(
      batch.map((s) =>
        rpcCall<TxMeta>(rpcUrl, "getTransaction", [
          s.signature,
          { encoding: "json", maxSupportedTransactionVersion: 0 },
        ]).catch(() => null),
      ),
    );
    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      if (!tx?.meta?.logMessages) continue;
      for (const log of tx.meta.logMessages) {
        const m = log.match(/^Program data: (.+)$/);
        if (!m) continue;
        const bytes = base64ToBytes(m[1]);
        if (bytes.length < 88) continue;
        if (!eq(bytes.slice(0, 8), claimedDisc)) continue;
        const owner = bytes32ToBase58(bytes.slice(40, 72));
        const principal = readU64LE(bytes, 72);
        const yieldPaid = readU64LE(bytes, 80);
        events.push({ signature: batch[j].signature, owner, principal, yieldPaid });
      }
    }
  }
  return events.slice(0, limit);
}
