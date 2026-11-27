import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { readFileSync } from "node:fs";
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

function requireEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is missing from .env. ${hint}`);
  }
  return value;
}

// The agent only ever sees its own token. The owner token unlocks approvals and the
// kill switch. Neither gives access to the agent's key, which stays in this process.
export const AGENT_TOKEN = () => requireEnv("OVERSIGN_AGENT_TOKEN", "Run: npm run setup:tokens");
export const OWNER_TOKEN = () => requireEnv("OVERSIGN_OWNER_TOKEN", "Run: npm run setup:tokens");

// The secret key bypasses the database rules, so it lives only in this service.
export const SUPABASE_URL = () => requireEnv("SUPABASE_URL", "Copy it from your Supabase project.");
export const SUPABASE_SECRET_KEY = () => requireEnv("SUPABASE_SECRET_KEY", "Copy it from Project Settings, API Keys.");

export async function loadSigner(role: "agent" | "attestor"): Promise<KeyPairSigner> {
  const secret = JSON.parse(readFileSync(`${ROOT}.keys/${role}.json`, "utf8")) as number[];
  return createKeyPairSignerFromBytes(Uint8Array.from(secret));
}
