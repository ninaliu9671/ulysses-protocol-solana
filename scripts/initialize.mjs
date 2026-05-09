/**
 * Initialize RewardPool + protocol_vault on devnet (v2.1).
 * Run once: node scripts/initialize.mjs
 */
import { readFileSync } from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("3TyFQro3GCCfd4yV5Wmbb2Rrzh35TreXJWMfbFs5dz5S");
const TREASURY = new PublicKey("9CYhSzFPXUQRmKncPtBFuPdRMZwumsexcDUVGaULcQo6");
const SLASH_AUTHORITY = new PublicKey("4CAGNZ1VbqVNpWRUFdHLpjmN6tnALLDMJrVMZdrRvtf6");
const RPC = "https://api.devnet.solana.com";
const KEYPAIR_PATH = String.raw`\\wsl.localhost\Ubuntu\home\ninaliu\solana-dev-keypair.json`;

const keypairBytes = JSON.parse(readFileSync(KEYPAIR_PATH, "utf8"));
const admin = Keypair.fromSecretKey(new Uint8Array(keypairBytes));
console.log("Admin:", admin.publicKey.toBase58());

const conn = new Connection(RPC, "confirmed");

const [rewardPoolPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("reward_pool")],
  PROGRAM_ID,
);
const [protocolVaultPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("protocol_vault")],
  PROGRAM_ID,
);

console.log("RewardPool PDA: ", rewardPoolPda.toBase58());
console.log("ProtocolVault PDA:", protocolVaultPda.toBase58());
console.log("Treasury:        ", TREASURY.toBase58());
console.log("SlashAuthority:  ", SLASH_AUTHORITY.toBase58());

const existing = await conn.getAccountInfo(rewardPoolPda);
if (existing && existing.data.length > 0) {
  console.log("✔ RewardPool already initialized. Lamports:", existing.lamports);
  process.exit(0);
}

console.log("\nSending initialize...");

// Anchor discriminator: sha256("global:initialize")[0..8]
const INITIALIZE_DISC = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);

const ix = new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: admin.publicKey, isSigner: true, isWritable: true },
    { pubkey: rewardPoolPda, isSigner: false, isWritable: true },
    { pubkey: protocolVaultPda, isSigner: false, isWritable: true },
    { pubkey: TREASURY, isSigner: false, isWritable: false },
    { pubkey: SLASH_AUTHORITY, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: INITIALIZE_DISC,
});

const tx = new Transaction().add(ix);
const sig = await sendAndConfirmTransaction(conn, tx, [admin], {
  commitment: "confirmed",
});
console.log("\n✔ Initialized!");
console.log("Tx:", sig);
console.log("Explorer: https://explorer.solana.com/tx/" + sig + "?cluster=devnet");
