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

let cachedDisc: { slashed?: Uint8Array; created?: Uint8Array; claimed?: Uint8Array; cancelled?: Uint8Array } = {};
async function getSlashedDisc(): Promise<Uint8Array> {
  if (!cachedDisc.slashed) cachedDisc.slashed = await eventDiscriminator("Slashed");
  return cachedDisc.slashed;
}

function readU64LE(b: Uint8Array, o: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(b[o + i]) << BigInt(8 * i);
  return v;
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

export type SlashedEvent = {
  signature: string;
  blockTime: number | null;
  commitment: string;
  owner: string;
  principal: bigint; // lamports
  type: "NoSell" | "HoldAbove" | "NoTradeWindow" | "AgentGuardian" | "Unknown";
};

function extractSlashType(logs: string[], slashLogIdx: number): SlashedEvent["type"] {
  // Walk back from the Slashed `Program data` line to find the most recent
  // `Program log: Instruction: Slash<Type>` emitted by the vault program.
  for (let i = slashLogIdx - 1; i >= 0; i--) {
    const m = logs[i].match(/Instruction: Slash(NoSell|HoldAbove|NoTradeWindow|AgentGuardian)/);
    if (m) return m[1] as SlashedEvent["type"];
  }
  return "Unknown";
}

type SignatureInfo = { signature: string; blockTime: number | null; err: unknown };
type TxMeta = {
  meta: { logMessages?: string[] | null } | null;
  blockTime: number | null;
};

/**
 * Fetch recent Slashed events emitted by the vault program.
 * @param limit Max events to return (we'll scan up to limit*4 sigs).
 */
export async function fetchSlashedEvents(
  rpcUrl: string,
  limit: number,
): Promise<SlashedEvent[]> {
  const slashedDisc = await getSlashedDisc();
  // Cap sig fetch — public devnet RPC chokes on big lists.
  const sigs = await rpcCall<SignatureInfo[]>(rpcUrl, "getSignaturesForAddress", [
    VAULT_PROGRAM_ADDRESS,
    { limit: 100 },
  ]);
  if (!sigs?.length) return [];

  const events: SlashedEvent[] = [];
  // Sequential batches of 3 to stay under devnet rate limit (~10 req/s).
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
      const logs = tx.meta.logMessages;
      for (let logIdx = 0; logIdx < logs.length; logIdx++) {
        const m = logs[logIdx].match(/^Program data: (.+)$/);
        if (!m) continue;
        const bytes = base64ToBytes(m[1]);
        if (bytes.length < 8) continue;
        if (!eq(bytes.slice(0, 8), slashedDisc)) continue;
        if (bytes.length < 8 + 32 + 32 + 8) continue;
        const commitment = bytes32ToBase58(bytes.slice(8, 40));
        const owner = bytes32ToBase58(bytes.slice(40, 72));
        const principal = readU64LE(bytes, 72);
        events.push({
          signature: batch[j].signature,
          blockTime: tx.blockTime,
          commitment,
          owner,
          principal,
          type: extractSlashType(logs, logIdx),
        });
      }
    }
  }
  return events.slice(0, limit);
}

/**
 * Total slashed (sum of principal) from all historical Slashed events.
 * Returns lamports.
 */
export async function fetchTotalSlashed(rpcUrl: string): Promise<bigint> {
  const events = await fetchSlashedEvents(rpcUrl, 1000);
  return events.reduce((sum, e) => sum + e.principal, 0n);
}
