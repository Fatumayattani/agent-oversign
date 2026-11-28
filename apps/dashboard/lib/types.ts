export type Verdict = "ALLOW" | "REVIEW" | "BLOCK";

export type Reason = { code: string; decision: Exclude<Verdict, "ALLOW">; message: string };

export type DecisionPayment = { payee: string; payeeName?: string; amount: string; mint?: string };

export type Decision = {
  id: string;
  created_at: string;
  agent: string;
  request_key: string;
  url: string;
  decision: Verdict;
  reasons: Reason[];
  payment: DecisionPayment | null;
  policy_hash: string;
  approved_by_owner: boolean;
  record_hash: string;
  attestor: string;
  anchor_transaction: string | null;
  settlement_transaction: string | null;
  inspection: Evidence | null;
};

// What Oversign saw before deciding, written by the service next to each decision.
export type Evidence = {
  feePayer: string;
  instructions: { index: number; kind: string; program: string; summary: string }[];
  transfers: { source: string; destination: string; authority: string; mint?: string; amount: string }[];
  approvals: number;
  authorityChanges: number;
  closes: number;
  computeUnitLimit?: number;
  computeUnitPrice?: string;
  simulation: {
    ok: boolean;
    error?: string;
    unitsConsumed?: string;
    changes: {
      account: string;
      owner?: string;
      before?: string;
      after?: string;
      ownerChanged: boolean;
      delegateChanged: boolean;
      closed: boolean;
    }[];
  } | null;
  timings: { decodeMs: number; simulateMs: number; evaluateMs: number };
};

export type Payment = {
  id: number;
  timestamp_ms: number;
  payee: string;
  amount: string;
  request_key: string;
};

export type Approval = {
  decision_id: string;
  approved_at: string;
  approved_by: string;
  used_at: string | null;
};

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
  ownerWallet?: string | null;
};

export type AgentState = {
  agent: string;
  frozen: boolean;
  updated_at: string;
  updated_by: string | null;
  policy: PolicySummary | null;
};
