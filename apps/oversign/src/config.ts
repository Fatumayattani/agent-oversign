import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

try {
  process.loadEnvFile(`${ROOT}.env`);
} catch {
  // No .env yet. Defaults below are used.
}

export const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
export const OVERSIGN_PORT = Number(process.env.OVERSIGN_PORT ?? 4030);
export const POLICY_PATH = process.env.OVERSIGN_POLICY ?? `${ROOT}packages/core/policies/research-agent.yaml`;
export const DATA_DIR = `${ROOT}data/`;
mkdirSync(DATA_DIR, { recursive: true });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing from .env. Run: npm run setup:tokens`);
  }
  return value;
}

// The agent only ever sees its own token. The owner token unlocks approvals and the
// kill switch. Neither gives access to the agent's key, which stays in this process.
export const AGENT_TOKEN = () => requireEnv("OVERSIGN_AGENT_TOKEN");
export const OWNER_TOKEN = () => requireEnv("OVERSIGN_OWNER_TOKEN");

export async function loadSigner(role: "agent" | "attestor"): Promise<KeyPairSigner> {
  const secret = JSON.parse(readFileSync(`${ROOT}.keys/${role}.json`, "utf8")) as number[];
  return createKeyPairSignerFromBytes(Uint8Array.from(secret));
}
