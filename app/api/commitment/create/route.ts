import { NextRequest } from "next/server";

const TREASURY = process.env.PROTOCOL_TREASURY_PUBKEY!;
const ACTIVATION_FEE_LAMPORTS = 1_000_000; // 0.001 SOL
const RPC_URL =
  process.env.HELIUS_RPC_URL ??
  "https://api.devnet.solana.com";

// Anti-replay: track used payment signatures in memory.
// In production, replace with a persistent store (Redis/SQLite).
const usedPaymentSignatures = new Set<string>();

export async function POST(req: NextRequest) {
  const paymentHeader = req.headers.get("X-Payment");

  // Step 1: No payment proof → return 402
  if (!paymentHeader) {
    return new Response(null, {
      status: 402,
      headers: {
        "X-Payment-Details": JSON.stringify({
          network: "solana-devnet",
          asset: "SOL",
          amount: String(ACTIVATION_FEE_LAMPORTS),
          payTo: TREASURY,
          memo: "ulysses-commitment-activation",
          expiresAt: Math.floor(Date.now() / 1000) + 120,
        }),
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "X-Payment-Details",
      },
    });
  }

  // Step 2: Verify payment
  const txSignature = Buffer.from(paymentHeader, "base64").toString("utf8");

  // Anti-replay: reject if this signature was already used
  if (usedPaymentSignatures.has(txSignature)) {
    return Response.json(
      { error: "Payment signature already used" },
      { status: 402 }
    );
  }

  const verified = await verifyPayment(txSignature);

  if (!verified) {
    return Response.json(
      { error: "Payment verification failed" },
      { status: 402 }
    );
  }

  // Step 3: Mark signature as used and authorize
  usedPaymentSignatures.add(txSignature);
  return Response.json({ authorized: true }, { status: 200 });
}

async function verifyPayment(txSignature: string): Promise<boolean> {
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [
          txSignature,
          { commitment: "confirmed", maxSupportedTransactionVersion: 0 },
        ],
      }),
    });

    const data = await response.json();
    const tx = data?.result;
    if (!tx) return false;

    // Find treasury account index
    const accountKeys: string[] =
      tx.transaction?.message?.accountKeys ?? [];
    const treasuryIndex = accountKeys.indexOf(TREASURY);
    if (treasuryIndex === -1) return false;

    // Check that treasury received at least ACTIVATION_FEE_LAMPORTS
    const preBalance: number = tx.meta?.preBalances?.[treasuryIndex] ?? 0;
    const postBalance: number = tx.meta?.postBalances?.[treasuryIndex] ?? 0;
    const received = postBalance - preBalance;

    return received >= ACTIVATION_FEE_LAMPORTS;
  } catch {
    return false;
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Payment",
      "Access-Control-Expose-Headers": "X-Payment-Details",
    },
  });
}
