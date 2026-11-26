import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount } from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  process.loadEnvFile();
} catch {
  // No .env yet. Defaults below are used.
}

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

// Payees need a USDC token account before they can receive x402 payments.
const RECIPIENTS = ["merchant", "attacker"];

function load(role: string): Keypair {
  const path = join(process.cwd(), ".keys", `${role}.json`);
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const owner = load("owner");

  for (const role of RECIPIENTS) {
    const recipient = load(role).publicKey;
    const account = await getOrCreateAssociatedTokenAccount(connection, owner, USDC_MINT, recipient);
    console.log(`${role.padEnd(9)} USDC account ${account.address.toBase58()}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
