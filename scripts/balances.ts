import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
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
const ROLES = ["owner", "agent", "merchant", "attacker", "attestor"];

function load(role: string): Keypair {
  const path = join(process.cwd(), ".keys", `${role}.json`);
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function usdcBalance(connection: Connection, owner: PublicKey): Promise<number> {
  const { value } = await connection.getParsedTokenAccountsByOwner(owner, { mint: USDC_MINT });
  return value.reduce((total, account) => {
    const amount = account.account.data.parsed.info.tokenAmount.uiAmount as number | null;
    return total + (amount ?? 0);
  }, 0);
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`${"role".padEnd(9)} ${"SOL".padStart(8)} ${"USDC".padStart(10)}  address`);

  for (const role of ROLES) {
    const { publicKey } = load(role);
    const sol = (await connection.getBalance(publicKey)) / LAMPORTS_PER_SOL;
    const usdc = await usdcBalance(connection, publicKey);
    console.log(
      `${role.padEnd(9)} ${sol.toFixed(2).padStart(8)} ${usdc.toFixed(2).padStart(10)}  ${publicKey.toBase58()}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});