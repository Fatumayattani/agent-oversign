import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  process.loadEnvFile();
} catch {
  // No .env yet. Defaults below are used.
}

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const AMOUNT_SOL = 0.5;

function load(role: string): Keypair {
  const path = join(process.cwd(), ".keys", `${role}.json`);
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const owner = load("owner");
  const attestor = load("attestor");

  const ownerBalance = await connection.getBalance(owner.publicKey);
  if (ownerBalance < (AMOUNT_SOL + 0.01) * LAMPORTS_PER_SOL) {
    console.log(`Owner has ${(ownerBalance / LAMPORTS_PER_SOL).toFixed(2)} SOL. Fund the owner first.`);
    process.exit(1);
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: owner.publicKey,
      toPubkey: attestor.publicKey,
      lamports: AMOUNT_SOL * LAMPORTS_PER_SOL,
    }),
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [owner]);
  const attestorBalance = await connection.getBalance(attestor.publicKey);

  console.log(`Sent ${AMOUNT_SOL} SOL from owner to attestor.`);
  console.log(`Attestor balance: ${(attestorBalance / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  console.log(`https://explorer.solana.com/tx/${signature}?cluster=devnet`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});