import { ROOT_ENV_LOADED } from "./config.js";

void ROOT_ENV_LOADED;

export type OversignResult = {
  status: number;
  body: string;
  decision: "ALLOW" | "REVIEW" | "BLOCK" | "NO_PAYMENT";
  approvedByOwner: boolean;
  reasons: { code: string; decision: string; message: string }[];
  recordId?: string;
  settled: boolean;
  transaction?: string;
  error?: string;
};

const OVERSIGN_URL = `http://localhost:${process.env.OVERSIGN_PORT ?? 4030}`;

// An agent that pays through Oversign. It holds a token, not a key, so every payment
// goes through Oversign's checks and nothing can switch them off from here.
export function createOversignAgent() {
  const token = process.env.OVERSIGN_AGENT_TOKEN;
  if (!token) throw new Error("OVERSIGN_AGENT_TOKEN is missing from .env. Run: npm run setup:tokens");

  async function pay(url: string): Promise<OversignResult> {
    const response = await fetch(`${OVERSIGN_URL}/pay`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
    if (!response.ok) {
      throw new Error(`Oversign returned ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as OversignResult;
  }

  return { pay };
}

// Owner actions, used here to stand in for the phone app until that PR lands.
export async function ownerApprove(recordId: string): Promise<void> {
  const token = process.env.OVERSIGN_OWNER_TOKEN;
  const response = await fetch(`${OVERSIGN_URL}/approvals/${recordId}/approve`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Approval failed: ${response.status} ${await response.text()}`);
}
