"use client";

import useSWR from "swr";
import { useCluster } from "./cluster-context";
import { getClusterUrl } from "../lib/solana-client";
import { rpcCall } from "../lib/rpc";
import { VAULT_PROGRAM_ADDRESS } from "../generated/vault";

type SignatureInfo = {
  signature: string;
  blockTime: number | null;
  err: unknown;
};

type TxMeta = {
  meta: { logMessages?: string[] | null } | null;
  blockTime: number | null;
};

type SlashEvent = {
  signature: string;
  blockTime: number | null;
  type: string;
  owner: string;
  principal: number;
};

function shortAddr(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function relativeTime(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

async function fetchRecentSlashes(rpcUrl: string, limit: number): Promise<SlashEvent[]> {
  const sigs = await rpcCall<SignatureInfo[]>(rpcUrl, "getSignaturesForAddress", [
    VAULT_PROGRAM_ADDRESS,
    { limit: 200 },
  ]);
  if (!sigs?.length) return [];

  const events: SlashEvent[] = [];
  for (let i = 0; i < sigs.length && events.length < limit; i += 10) {
    const batch = sigs.slice(i, i + 10);
    const txs = await Promise.all(
      batch.map((s) =>
        rpcCall<TxMeta>(rpcUrl, "getTransaction", [
          s.signature,
          { encoding: "json", maxSupportedTransactionVersion: 0 },
        ]).catch(() => null),
      ),
    );
    txs.forEach((tx, j) => {
      if (!tx?.meta?.logMessages) return;
      const logs = tx.meta.logMessages;
      const slashLog = logs.find((l) => l.includes("Slashed"));
      if (!slashLog) return;
      const ownerMatch = slashLog.match(/owner[=:\s]+([1-9A-HJ-NP-Za-km-z]{32,44})/);
      const typeMatch = slashLog.match(/(NoSell|HoldAbove|NoTradeWindow|AgentGuardian)/);
      const principalMatch = slashLog.match(/principal[=:\s]+(\d+)/);
      events.push({
        signature: batch[j].signature,
        blockTime: tx.blockTime,
        type: typeMatch?.[1] ?? "?",
        owner: ownerMatch?.[1] ?? "",
        principal: principalMatch ? Number(principalMatch[1]) / 1e9 : 0,
      });
    });
  }
  return events.slice(0, limit);
}

export function SirenGraveyardSection({ limit = 10 }: { limit?: number } = {}) {
  const { cluster } = useCluster();
  const url = getClusterUrl(cluster);
  const { data, isLoading } = useSWR(
    ["siren-graveyard", url, limit],
    () => fetchRecentSlashes(url, limit),
    { refreshInterval: 30_000 },
  );

  return (
    <div className="rounded-xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4 pb-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="text-lg font-bold" style={{ color: "var(--gold)" }}>Siren Graveyard</h3>
        <span className="text-xs" style={{ color: "var(--muted)" }}>Recent slashes</span>
      </div>
      {isLoading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>Scanning chain…</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No slashes recorded yet.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] font-bold pb-2" style={{ color: "var(--muted)", letterSpacing: "0.1em", borderBottom: "1px solid var(--border)" }}>
            <div className="col-span-3">TIME</div>
            <div className="col-span-3">USER</div>
            <div className="col-span-3">TYPE</div>
            <div className="col-span-3 text-right">LOSS (SOL)</div>
          </div>
          {data.map((e) => (
            <div key={e.signature} className="grid grid-cols-12 gap-2 text-xs py-1.5" style={{ color: "var(--foreground)" }}>
              <div className="col-span-3" style={{ color: "var(--muted)" }}>{relativeTime(e.blockTime)}</div>
              <div className="col-span-3 font-mono">{e.owner ? shortAddr(e.owner) : "—"}</div>
              <div className="col-span-3">{e.type}</div>
              <div className="col-span-3 text-right" style={{ color: "#fca5a5" }}>−{e.principal.toFixed(4)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
