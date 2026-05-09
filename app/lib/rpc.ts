// Lightweight JSON-RPC helpers used across hooks.
// Avoids pulling in a full RPC builder per call site.

export async function rpcCall<T = unknown>(
  url: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = (await res.json()) as { result?: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result as T;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export type RawAccount = {
  pubkey: string;
  account: { data: [string, string]; lamports: number; owner: string };
};

export async function getProgramAccountsByDisc(
  url: string,
  programId: string,
  discriminator: Uint8Array,
  extraFilters: { memcmp: { offset: number; bytes: string; encoding: string } }[] = [],
): Promise<RawAccount[]> {
  const result = await rpcCall<RawAccount[]>(url, "getProgramAccounts", [
    programId,
    {
      filters: [
        { memcmp: { offset: 0, bytes: bytesToBase64(discriminator), encoding: "base64" } },
        ...extraFilters,
      ],
      encoding: "base64",
    },
  ]);
  return result ?? [];
}
