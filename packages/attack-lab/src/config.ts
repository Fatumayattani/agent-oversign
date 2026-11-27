import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

try {
  process.loadEnvFile(`${ROOT}.env`);
} catch {
  // No .env yet. Defaults below are used.
}

// Importing this module loads the root .env.
export const ROOT_ENV_LOADED = true;

export const SOLANA_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
export const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const FACILITATOR_URL = process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator";

export const MERCHANT_PORT = Number(process.env.MERCHANT_PORT ?? 4021);
export const MERCHANT_URL = `http://localhost:${MERCHANT_PORT}`;

export const ATTACK_PORT = Number(process.env.ATTACK_PORT ?? 4022);
export const ATTACK_URL = `http://localhost:${ATTACK_PORT}`;

export type Role = "owner" | "agent" | "merchant" | "attacker" | "attestor";

export async function loadSigner(role: Role): Promise<KeyPairSigner> {
  const secret = JSON.parse(readFileSync(`${ROOT}.keys/${role}.json`, "utf8")) as number[];
  return createKeyPairSignerFromBytes(Uint8Array.from(secret));
}
