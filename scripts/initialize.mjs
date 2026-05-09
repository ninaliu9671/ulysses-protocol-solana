/**
 * Initialize ProtocolState on devnet.
 * Run once: node scripts/initialize.mjs
 */
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("7s1UK1nQWK7CrNcaS576gbpMjMqrph1vArRepnQYLki7");
const RPC = "https://api.devnet.solana.com";

// Load deployer keypair (same as anchor's provider wallet)
// Try Windows path first, then home dir
let keypairBytes;
try {
  // Anchor uses ~/.config/solana/id.json on Linux/WSL
  keypairBytes = JSON.parse(
    readFileSync(join(homedir(), ".config", "solana", "id.json"), "utf8")
  );
} catch {
  // Fallback: try solana-keypair.json in home
  keypairBytes = JSON.parse(
    readFileSync(join(homedir(), "solana-keypair.json"), "utf8")
  );
}
const payer = Keypair.fromSecretKey(new Uint8Array(keypairBytes));
console.log("Payer:", payer.publicKey.toBase58());

const conn = new Connection(RPC, "confirmed");

// Derive PDAs
const [protocolStatePda, protocolStateBump] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol")],
  PROGRAM_ID
);
const [protocolVaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol_vault")],
  PROGRAM_ID
);

console.log("ProtocolState PDA:", protocolStatePda.toBase58());
console.log("ProtocolVault PDA:", protocolVaultPda.toBase58());

// Check if already initialized
const existing = await conn.getAccountInfo(protocolStatePda);
if (existing && existing.data.length > 0) {
  console.log("✔ ProtocolState already initialized! Lamports:", existing.lamports);
  process.exit(0);
}

console.log("ProtocolState not found — sending initialize...");

// Anchor discriminator for "initialize": sha256("global:initialize")[0..8]
// Pre-computed: [175, 175, 109, 31, 13, 152, 155, 237]
const INITIALIZE_DISC = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

// Encode authority (32 bytes, payer's pubkey)
const authorityBytes = payer.publicKey.toBuffer();

const data = Buffer.concat([INITIALIZE_DISC, authorityBytes]);

const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },    // payer
    { pubkey: protocolStatePda, isSigner: false, isWritable: true },  // protocol_state
    { pubkey: protocolVaultPda, isSigner: false, isWritable: true },  // protocol_vault
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ],
  data,
});

const tx = new Transaction().add(ix);
const sig = await sendAndConfirmTransaction(conn, tx, [payer], {
  commitment: "confirmed",
});
console.log("✔ Initialized! Tx:", sig);
console.log("Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
