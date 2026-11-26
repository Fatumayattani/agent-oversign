import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

try {
  process.loadEnvFile();
} catch {
  // No .env yet. Defaults below are used.
}

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const KEYS_DIR = join(process.cwd(), ".keys");

const ROLES = ["owner", "agent", "merchant", "attacker", "attestor"] as const;
type Role = (typeof ROLES)[number];

// Roles that send transactions on devnet and need SOL for fees.
const NEEDS_SOL: Role[] = ["owner", "agent", "attestor"];
const MIN_BALANCE = 0.5 * LAMPORTS_PER_SOL;

function loadOrCreate(role: Role): Keypair {
  const path = join(KEYS_DIR, `${role}.json`);
  if (existsSync(path)) {
    const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
    return Keypair.fromSecretKey(Uint8Array.from(secret));
  }
  const keypair = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return keypair;
}

async function airdrop(connection: Connection, keypair: Keypair): Promise<boolean> {
  try {
    const signature = await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL);
    const latest = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  mkdirSync(KEYS_DIR, { recursive: true });
  const connection = new Connection(RPC_URL, "confirmed");

  console.log(`RPC: ${RPC_URL}\n`);

  for (const role of ROLES) {
    const keypair = loadOrCreate(role);
    const address = keypair.publicKey.toBase58();
    let balance = await connection.getBalance(keypair.publicKey);

    if (NEEDS_SOL.includes(role) && balance < MIN_BALANCE) {
      const ok = await airdrop(connection, keypair);
      if (ok) {
        balance = await connection.getBalance(keypair.publicKey);
      } else {
        console.log(`  Airdrop failed for ${role}. Use https://faucet.solana.com with ${address}`);
      }
    }

    console.log(`${role.padEnd(9)} ${address}  ${(balance / LAMPORTS_PER_SOL).toFixed(2)} SOL`);
  }

  const agent = loadOrCreate("agent").publicKey.toBase58();
  console.log(`\nNext: get devnet USDC for the agent at https://faucet.circle.com`);
  console.log(`Choose Solana Devnet and paste: ${agent}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});