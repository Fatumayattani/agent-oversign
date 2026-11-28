import type { Reason } from "./types";

// Every rule Oversign checks, in the order the signer checks them. The signer runs
// all of them on every payment and reports each one that fails, so a rule with no
// matching reason passed.
export type Rule = { label: string; codes: string[]; needsPayment?: boolean };

export const RULES: Rule[] = [
  { label: "Agent is not frozen", codes: ["AGENT_FROZEN"] },
  { label: "Only programs the policy lists", codes: ["UNKNOWN_PROGRAM"] },
  { label: "No permission to spend later", codes: ["APPROVAL_PRESENT"] },
  { label: "No change of account control", codes: ["AUTHORITY_CHANGE", "ACCOUNT_CLOSE"] },
  { label: "Priority fee within the limit", codes: ["COMPUTE_PRICE_TOO_HIGH"] },
  { label: "Exactly one USDC transfer, from the agent", codes: ["NOT_EXACTLY_ONE_TRANSFER", "WRONG_ASSET", "TRANSFER_NOT_FROM_AGENT"] },
  { label: "Solana agrees with what the bytes say", codes: ["SIMULATION_MISSING", "SIMULATION_FAILED", "UNEXPECTED_EFFECT"] },
  { label: "Under the per-payment limit", codes: ["OVER_PER_PAYMENT_LIMIT"], needsPayment: true },
  { label: "Within the daily budget", codes: ["OVER_DAILY_BUDGET"], needsPayment: true },
  { label: "Payee is on the list", codes: ["UNKNOWN_PAYEE", "PAYEE_BLOCKED"], needsPayment: true },
  { label: "Price is the usual price", codes: ["PRICE_ABOVE_USUAL"], needsPayment: true },
  { label: "Within the daily limit for this payee", codes: ["OVER_PER_PAYEE_DAILY"], needsPayment: true },
  { label: "Not a repeat of a recent payment", codes: ["DUPLICATE_REQUEST"], needsPayment: true },
];

export type RuleResult = { rule: Rule; outcome: "pass" | "hold" | "block" | "skipped"; reasons: Reason[] };

export function checkRules(reasons: Reason[], hasPayment: boolean): RuleResult[] {
  return RULES.map((rule) => {
    const matched = reasons.filter((reason) => rule.codes.includes(reason.code));
    if (matched.some((reason) => reason.decision === "BLOCK")) return { rule, outcome: "block", reasons: matched };
    if (matched.length > 0) return { rule, outcome: "hold", reasons: matched };
    if (rule.needsPayment && !hasPayment) return { rule, outcome: "skipped", reasons: [] };
    return { rule, outcome: "pass", reasons: [] };
  });
}

const PROGRAMS: Record<string, string> = {
  ComputeBudget111111111111111111111111111111: "Compute Budget",
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: "Token",
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: "Token-2022",
  MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr: "Memo",
  L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95: "Lighthouse",
};

export const programName = (program: string): string | undefined => PROGRAMS[program];

// Instruction kinds that move control or money in ways a plain payment never needs.
export const DANGEROUS_KINDS = new Set(["token-approve", "token-set-authority", "token-close-account", "unknown", "token-other"]);
