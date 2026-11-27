import type { Policy } from "./schema.js";
import type { LoadedPolicy } from "./load.js";
import type { SimulatedEffects, StaticEffects } from "../types.js";

export type Decision = "ALLOW" | "REVIEW" | "BLOCK";

export type ReasonCode =
  | "AGENT_FROZEN"
  | "UNKNOWN_PROGRAM"
  | "APPROVAL_PRESENT"
  | "AUTHORITY_CHANGE"
  | "ACCOUNT_CLOSE"
  | "COMPUTE_PRICE_TOO_HIGH"
  | "NOT_EXACTLY_ONE_TRANSFER"
  | "WRONG_ASSET"
  | "TRANSFER_NOT_FROM_AGENT"
  | "SIMULATION_MISSING"
  | "SIMULATION_FAILED"
  | "UNEXPECTED_EFFECT"
  | "PAYEE_BLOCKED"
  | "OVER_PER_PAYMENT_LIMIT"
  | "OVER_DAILY_BUDGET"
  | "UNKNOWN_PAYEE"
  | "PRICE_ABOVE_USUAL"
  | "OVER_PER_PAYEE_DAILY"
  | "DUPLICATE_REQUEST";

export type Reason = {
  code: ReasonCode;
  decision: Exclude<Decision, "ALLOW">;
  message: string;
};

export type PaymentRecord = {
  timestamp: number;
  payee: string;
  amount: bigint;
  requestKey: string;
};

export type EvaluationInput = {
  staticEffects: StaticEffects;
  simulated?: SimulatedEffects;
  // The agent's wallet. Payments must come from it and nothing else may change it.
  agent: string;
  // The request this payment is for, used to spot paying twice for the same thing.
  requestKey: string;
  history: PaymentRecord[];
  frozen?: boolean;
  now?: number;
};

export type Evaluation = {
  decision: Decision;
  reasons: Reason[];
  payment?: { payee: string; payeeName?: string; amount: bigint; mint?: string };
  policy: { agent: string; hash: string };
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toAtomic(usd: number, decimals: number): bigint {
  return BigInt(Math.round(usd * 10 ** decimals));
}

function formatUsd(amount: bigint, decimals: number): string {
  return `$${(Number(amount) / 10 ** decimals).toFixed(2)}`;
}

// Who owns the destination token account, taken from the chain's view of it before
// the transaction runs. Never taken from what the server said.
function payeeOwner(destination: string, simulated?: SimulatedEffects): string | undefined {
  return simulated?.changes.find((change) => change.account === destination)?.owner?.before;
}

// Deterministic: the same input and policy always give the same decision.
// Every rule that fails is reported, and the strictest one decides.
export function evaluate(loaded: LoadedPolicy, input: EvaluationInput): Evaluation {
  const { policy } = loaded;
  const decimals = policy.asset.decimals;
  const now = input.now ?? Date.now();
  const reasons: Reason[] = [];
  const block = (code: ReasonCode, message: string) => reasons.push({ code, decision: "BLOCK", message });
  const review = (code: ReasonCode, message: string) => reasons.push({ code, decision: "REVIEW", message });
  const { staticEffects: fx, simulated } = input;

  if (input.frozen) {
    block("AGENT_FROZEN", "The owner has frozen this agent.");
  }

  // Transaction shape: only known programs, no approvals or control changes.
  const allowedPrograms = new Set(policy.transactions.allowed_programs);
  const unknown = fx.instructions.filter((item) => !allowedPrograms.has(item.program));
  for (const program of new Set(unknown.map((item) => item.program))) {
    block("UNKNOWN_PROGRAM", `Calls a program not in the policy: ${program}`);
  }
  if (fx.approvals.length > 0 && !policy.transactions.allow_approvals) {
    for (const approval of fx.approvals) {
      block("APPROVAL_PRESENT", `Approves ${approval.delegate} to spend from ${approval.account}.`);
    }
  }
  if (fx.authorityChanges.length > 0 && !policy.transactions.allow_authority_changes) {
    for (const change of fx.authorityChanges) {
      block("AUTHORITY_CHANGE", `Changes control of ${change.account} to ${change.newAuthority ?? "nobody"}.`);
    }
  }
  if (fx.closes.length > 0 && !policy.transactions.allow_account_closes) {
    for (const close of fx.closes) {
      block("ACCOUNT_CLOSE", `Closes ${close.account}.`);
    }
  }
  const unitPrice = fx.computeUnitPriceMicroLamports ?? 0n;
  if (unitPrice > BigInt(policy.transactions.max_compute_unit_price_microlamports)) {
    block("COMPUTE_PRICE_TOO_HIGH", `Compute unit price ${unitPrice} is above the policy maximum.`);
  }

  // Exactly one payment, in the policy's asset, signed by the agent.
  let payment: Evaluation["payment"];
  if (fx.transfers.length !== 1) {
    block("NOT_EXACTLY_ONE_TRANSFER", `Expected exactly one transfer, found ${fx.transfers.length}.`);
  } else {
    const transfer = fx.transfers[0]!;
    if (transfer.mint !== policy.asset.mint) {
      block("WRONG_ASSET", `Pays in ${transfer.mint ?? "an unchecked token"}, policy allows only ${policy.asset.symbol}.`);
    }
    if (transfer.authority !== input.agent) {
      block("TRANSFER_NOT_FROM_AGENT", `Transfer is authorised by ${transfer.authority}, not the agent.`);
    }
    const payee = payeeOwner(transfer.destination, simulated) ?? transfer.destination;
    const known = policy.payees.allowed.find((entry) => entry.address === payee);
    payment = { payee, payeeName: known?.name, amount: transfer.amount, mint: transfer.mint };
  }

  // What the chain says must match what the bytes say.
  if (!simulated) {
    if (policy.transactions.require_simulation) {
      block("SIMULATION_MISSING", "No simulation result, so effects cannot be confirmed.");
    }
  } else if (!simulated.ok) {
    block("SIMULATION_FAILED", `Simulation failed: ${simulated.error}`);
  } else {
    for (const change of simulated.changes) {
      if (change.owner && change.owner.before !== change.owner.after) {
        block("UNEXPECTED_EFFECT", `Owner of ${change.account} would change.`);
      }
      if (change.delegate && change.delegate.before !== change.delegate.after) {
        block("UNEXPECTED_EFFECT", `Delegate of ${change.account} would change.`);
      }
      if (change.existsBefore && !change.existsAfter) {
        block("UNEXPECTED_EFFECT", `${change.account} would be closed.`);
      }
      const isAgentAccount = change.owner?.before === input.agent;
      if (isAgentAccount && change.amount && payment) {
        const outflow = change.amount.before - change.amount.after;
        if (outflow > payment.amount) {
          block("UNEXPECTED_EFFECT", `Agent would lose ${formatUsd(outflow, decimals)}, more than the ${formatUsd(payment.amount, decimals)} payment.`);
        }
      }
    }
  }

  // Spending rules, using the payment as the chain will see it.
  if (payment) {
    const knownPayee = policy.payees.allowed.find((entry) => entry.address === payment.payee);
    const recent = input.history.filter((record) => now - record.timestamp < DAY_MS);
    const spentToday = recent.reduce((sum, record) => sum + record.amount, 0n);
    const spentWithPayee = recent
      .filter((record) => record.payee === payment.payee)
      .reduce((sum, record) => sum + record.amount, 0n);

    if (payment.amount > toAtomic(policy.limits.max_per_payment_usd, decimals)) {
      block("OVER_PER_PAYMENT_LIMIT", `${formatUsd(payment.amount, decimals)} is above the ${formatUsd(toAtomic(policy.limits.max_per_payment_usd, decimals), decimals)} per-payment limit.`);
    }
    if (spentToday + payment.amount > toAtomic(policy.limits.daily_budget_usd, decimals)) {
      block("OVER_DAILY_BUDGET", `Would bring today's spending to ${formatUsd(spentToday + payment.amount, decimals)}, above the ${formatUsd(toAtomic(policy.limits.daily_budget_usd, decimals), decimals)} daily budget.`);
    }

    if (!knownPayee) {
      const message = `Payee ${payment.payee} is not in the policy.`;
      if (policy.payees.unknown === "block") block("PAYEE_BLOCKED", message);
      else review("UNKNOWN_PAYEE", message);
    } else if (payment.amount > toAtomic(knownPayee.usual_price_usd, decimals)) {
      review("PRICE_ABOVE_USUAL", `${formatUsd(payment.amount, decimals)} is above the usual ${formatUsd(toAtomic(knownPayee.usual_price_usd, decimals), decimals)} for ${knownPayee.name}.`);
    }

    if (spentWithPayee + payment.amount > toAtomic(policy.limits.per_payee_daily_usd, decimals)) {
      review("OVER_PER_PAYEE_DAILY", `Would bring today's spending with this payee to ${formatUsd(spentWithPayee + payment.amount, decimals)}.`);
    }

    const windowMs = policy.duplicates.window_seconds * 1000;
    const duplicate = input.history.find(
      (record) => record.requestKey === input.requestKey && now - record.timestamp < windowMs,
    );
    if (duplicate) {
      review("DUPLICATE_REQUEST", `Already paid for ${input.requestKey} ${Math.round((now - duplicate.timestamp) / 1000)}s ago.`);
    }
  }

  const decision: Decision = reasons.some((reason) => reason.decision === "BLOCK")
    ? "BLOCK"
    : reasons.some((reason) => reason.decision === "REVIEW")
      ? "REVIEW"
      : "ALLOW";

  return { decision, reasons, payment, policy: { agent: policy.agent, hash: loaded.hash } };
}

export type { Policy };
