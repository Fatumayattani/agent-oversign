import { createClient } from "@supabase/supabase-js";
import type { PaymentRecord } from "@agent-oversign/core";
import { verifyWalletApproval } from "./approval.js";
import { OWNER_WALLET, SUPABASE_SECRET_KEY, SUPABASE_URL } from "./config.js";
import type { Evidence } from "./evidence.js";
import type { DecisionBody, DecisionRecord } from "./records.js";

// Supabase is the control plane. This service writes with the secret key, which never
// leaves this process. The dashboard and phone sign in as the owner and can only read,
// approve REVIEW decisions and flip the kill switch, as the database rules allow.
const db = createClient(SUPABASE_URL(), SUPABASE_SECRET_KEY(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DAY_MS = 24 * 60 * 60 * 1000;
const APPROVAL_TTL_MS = 10 * 60 * 1000;

function check(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`Supabase ${action} failed: ${error.message}`);
}

type DecisionRow = {
  id: string;
  body: DecisionBody;
  record_hash: string;
  attestor: string;
  signature: string;
  anchor_transaction: string | null;
  settlement_transaction: string | null;
};

// The record is rebuilt from body, the exact contents that were hashed and signed.
function toRecord(row: DecisionRow): DecisionRecord {
  return {
    ...row.body,
    recordHash: row.record_hash,
    attestor: row.attestor,
    signature: row.signature,
    anchorTransaction: row.anchor_transaction ?? undefined,
    settlementTransaction: row.settlement_transaction ?? undefined,
  };
}

const DECISION_COLUMNS = "id, body, record_hash, attestor, signature, anchor_transaction, settlement_transaction";

// Creates the agent's row on first start. An existing row, and its frozen flag, is kept.
export async function ensureAgent(agent: string): Promise<void> {
  const { error } = await db.from("agent_state").upsert({ agent }, { onConflict: "agent", ignoreDuplicates: true });
  check(error, "agent_state upsert");
}

// What the dashboard shows as "the rules in force": the policy this service loaded,
// written on every start so the dashboard never shows a stale copy.
export type PolicySummary = {
  name: string;
  hash: string;
  asset: string;
  maxPerPayment: number;
  dailyBudget: number;
  perPayeeDaily: number;
  duplicateWindowSeconds: number;
  unknownPayees: "review" | "block";
  payees: { name: string; address: string; usualPrice: number }[];
  ownerWallet: string | null;
};

export async function publishPolicy(agent: string, policy: PolicySummary): Promise<void> {
  const { error } = await db.from("agent_state").update({ policy }).eq("agent", agent);
  check(error, "policy publish");
}

// Budgets and the duplicate window look back at most a day.
export async function loadHistory(agent: string): Promise<PaymentRecord[]> {
  const since = Date.now() - DAY_MS;
  const { data, error } = await db
    .from("payments")
    .select("timestamp_ms, payee, amount, request_key")
    .eq("agent", agent)
    .gte("timestamp_ms", since);
  check(error, "payments read");
  return (data ?? []).map((row) => ({
    timestamp: Number(row.timestamp_ms),
    payee: row.payee as string,
    amount: BigInt(row.amount as string),
    requestKey: row.request_key as string,
  }));
}

export async function recordPayment(agent: string, decisionId: string, payment: PaymentRecord): Promise<void> {
  const { error } = await db.from("payments").insert({
    timestamp_ms: payment.timestamp,
    agent,
    payee: payment.payee,
    amount: payment.amount.toString(),
    request_key: payment.requestKey,
    decision_id: decisionId,
  });
  check(error, "payment insert");
}

export async function appendDecision(record: DecisionRecord, evidence?: Evidence): Promise<void> {
  const { recordHash, attestor, signature, anchorTransaction, settlementTransaction, ...body } = record;
  const { error } = await db.from("decisions").insert({
    id: body.id,
    created_at: new Date(body.timestamp).toISOString(),
    agent: body.agent,
    request_key: body.requestKey,
    url: body.url,
    decision: body.decision,
    reasons: body.reasons,
    payment: body.payment,
    policy_hash: body.policyHash,
    approved_by_owner: body.approvedByOwner,
    record_hash: recordHash,
    attestor,
    signature,
    body,
    anchor_transaction: anchorTransaction ?? null,
    settlement_transaction: settlementTransaction ?? null,
    inspection: evidence ?? null,
  });
  check(error, "decision insert");
}

export async function loadDecisions(limit = 100): Promise<DecisionRecord[]> {
  const { data, error } = await db
    .from("decisions")
    .select(DECISION_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  check(error, "decisions read");
  return ((data ?? []) as DecisionRow[]).map(toRecord);
}

export async function getDecision(id: string): Promise<DecisionRecord | undefined> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
  const { data, error } = await db.from("decisions").select(DECISION_COLUMNS).eq("id", id).maybeSingle();
  check(error, "decision read");
  return data ? toRecord(data as DecisionRow) : undefined;
}

export async function latestDecision(): Promise<DecisionRecord | undefined> {
  return (await loadDecisions(1))[0];
}

export async function updateDecision(
  id: string,
  update: Pick<Partial<DecisionRecord>, "anchorTransaction" | "settlementTransaction">,
): Promise<void> {
  const columns: Record<string, string> = {};
  if (update.anchorTransaction) columns.anchor_transaction = update.anchorTransaction;
  if (update.settlementTransaction) columns.settlement_transaction = update.settlementTransaction;
  if (Object.keys(columns).length === 0) return;
  const { error } = await db.from("decisions").update(columns).eq("id", id);
  check(error, "decision update");
}

// Owner approval through the service's owner token. The dashboard and phone insert
// into the same table directly, as the signed-in owner.
export async function addApproval(decisionId: string, approvedBy: string): Promise<void> {
  const { error } = await db
    .from("approvals")
    .upsert({ decision_id: decisionId, approved_by: approvedBy }, { onConflict: "decision_id", ignoreDuplicates: true });
  check(error, "approval insert");
}

type ApprovalRow = {
  decision_id: string;
  approved_by: string;
  signer: string | null;
  signature: string | null;
  signed_message: string | null;
  decisions: {
    request_key: string;
    agent: string;
    record_hash: string;
    payment: { payee: string; amount: string } | null;
  };
};

// One approval covers one payment: the same agent, request, payee and amount, within
// ten minutes of approving, used once. An approval from the dashboard or phone counts
// only if the owner's wallet signed it; the service's own owner token is the one
// exception. Marking it used is a conditional update, so two retries racing for the
// same approval cannot both get it.
export async function takeApproval(agent: string, requestKey: string, payee: string, amount: bigint): Promise<boolean> {
  const since = new Date(Date.now() - APPROVAL_TTL_MS).toISOString();
  const { data, error } = await db
    .from("approvals")
    .select("decision_id, approved_by, signer, signature, signed_message, decisions!inner(request_key, agent, record_hash, payment)")
    .is("used_at", null)
    .gte("approved_at", since)
    .eq("decisions.agent", agent)
    .eq("decisions.request_key", requestKey);
  check(error, "approvals read");

  const rows = ((data ?? []) as unknown as ApprovalRow[]).filter(
    (row) => row.decisions.payment?.payee === payee && row.decisions.payment?.amount === amount.toString(),
  );

  for (const row of rows) {
    const trusted = row.approved_by === "owner-token" || (await walletApproved(row));
    if (!trusted) continue;

    const { data: claimed, error: claimError } = await db
      .from("approvals")
      .update({ used_at: new Date().toISOString() })
      .eq("decision_id", row.decision_id)
      .is("used_at", null)
      .select("decision_id");
    check(claimError, "approval claim");
    if ((claimed ?? []).length === 1) return true;
  }
  return false;
}

async function walletApproved(row: ApprovalRow): Promise<boolean> {
  if (!row.signer) return false;
  if (!OWNER_WALLET) {
    console.warn(
      `Ignoring an approval signed by wallet ${row.signer}: no owner wallet is set. ` +
        `If that is your wallet, add OVERSIGN_OWNER_WALLET=${row.signer} to .env and restart.`,
    );
    return false;
  }
  const valid = await verifyWalletApproval(
    {
      decisionId: row.decision_id,
      recordHash: row.decisions.record_hash,
      payee: row.decisions.payment!.payee,
      amount: row.decisions.payment!.amount,
      signer: row.signer,
      signature: row.signature,
      signedMessage: row.signed_message,
    },
    OWNER_WALLET,
  );
  if (!valid) console.warn(`Ignoring approval for ${row.decision_id}: not a valid signature from the owner wallet.`);
  return valid;
}

// Kill switch. Read fresh before every payment, so a freeze from the dashboard or
// phone takes effect on the very next signature.
export async function isFrozen(agent: string): Promise<boolean> {
  const { data, error } = await db.from("agent_state").select("frozen").eq("agent", agent).maybeSingle();
  check(error, "agent_state read");
  return data?.frozen === true;
}

export async function setFrozen(agent: string, frozen: boolean, updatedBy: string): Promise<void> {
  const { error } = await db
    .from("agent_state")
    .upsert({ agent, frozen, updated_at: new Date().toISOString(), updated_by: updatedBy }, { onConflict: "agent" });
  check(error, "agent_state update");
}
