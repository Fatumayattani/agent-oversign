import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { evaluate, type EvaluationInput, type PaymentRecord } from "../src/policy/evaluate.js";
import { loadPolicy } from "../src/policy/load.js";
import type { SimulatedEffects, StaticEffects } from "../src/types.js";

// One test per attack from the attack lab, plus the honest payment.
// Each builds the effects Oversign would see and checks the decision and reason.
const policy = loadPolicy(fileURLToPath(new URL("../policies/research-agent.yaml", import.meta.url)));

const MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const AGENT = "9id5tEaz9MYnnuNUPnoWqcBmcbre3zghZBkVkMFKh2MH";
const AGENT_USDC = "4rM7iThDZjeB82qMkmh3VW43E1wxzeFMfb8CBWpSGLHs";
const MERCHANT = "6DZJt21dFMtSHWPZQvtj8ghVZHoLpE6L3yk6wwKQZJ36";
const MERCHANT_USDC = "DTvJmhEUVVZMLx6peuSudjj6EJYoE2b8Tvwz18soX813";
const ATTACKER = "EwhojnX6rFJyN1KJVFAk2o7eupTFmh3Ni7sM62akCLug";
const ATTACKER_USDC = "DVenAw9VeiChLywZeAykcn3ir215CZ52hqG4fgMDkmef";
const COMPUTE = "ComputeBudget111111111111111111111111111111";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const NOW = 1_800_000_000_000;

function usdc(usd: number): bigint {
  return BigInt(Math.round(usd * 1_000_000));
}

function payment(amount: bigint, destination: string, payee: string): { fx: StaticEffects; sim: SimulatedEffects } {
  const fx: StaticEffects = {
    feePayer: "CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5",
    instructions: [
      { index: 0, kind: "compute-unit-limit", program: COMPUTE, summary: "" },
      { index: 1, kind: "compute-unit-price", program: COMPUTE, summary: "" },
      { index: 2, kind: "token-transfer", program: TOKEN, summary: "" },
      { index: 3, kind: "memo", program: MEMO, summary: "" },
    ],
    transfers: [{ source: AGENT_USDC, destination, authority: AGENT, mint: MINT, amount, decimals: 6 }],
    approvals: [],
    authorityChanges: [],
    closes: [],
    unknownPrograms: [],
    computeUnitLimit: 40_000,
    computeUnitPriceMicroLamports: 1n,
    memos: ["nonce"],
  };
  const sim: SimulatedEffects = {
    ok: true,
    logs: [],
    changes: [
      {
        account: AGENT_USDC,
        existsBefore: true,
        existsAfter: true,
        owner: { before: AGENT, after: AGENT },
        amount: { before: usdc(20), after: usdc(20) - amount },
        delegate: {},
        delegatedAmount: { before: 0n, after: 0n },
      },
      {
        account: destination,
        existsBefore: true,
        existsAfter: true,
        owner: { before: payee, after: payee },
        amount: { before: 0n, after: amount },
        delegate: {},
        delegatedAmount: { before: 0n, after: 0n },
      },
    ],
  };
  return { fx, sim };
}

function input(fx: StaticEffects, sim: SimulatedEffects | undefined, extra: Partial<EvaluationInput> = {}): EvaluationInput {
  return { staticEffects: fx, simulated: sim, agent: AGENT, requestKey: "GET /fx-rate?pair=USD-KES", history: [], now: NOW, ...extra };
}

function codes(result: ReturnType<typeof evaluate>): string[] {
  return result.reasons.map((reason) => reason.code);
}

test("honest $0.01 payment to the listed merchant is allowed", () => {
  const { fx, sim } = payment(usdc(0.01), MERCHANT_USDC, MERCHANT);
  const result = evaluate(policy, input(fx, sim));
  assert.equal(result.decision, "ALLOW");
  assert.deepEqual(result.reasons, []);
  assert.equal(result.payment?.payeeName, "fx-rates");
  assert.equal(result.policy.hash.length, 64);
});

test("attack 1, micro-drain: blocked once the daily budget is used up", () => {
  const history: PaymentRecord[] = [0, 1].map((page) => ({
    timestamp: NOW - 60_000,
    payee: MERCHANT,
    amount: usdc(0.99),
    requestKey: `GET /report?page=${page}`,
  }));
  const { fx, sim } = payment(usdc(0.49), MERCHANT_USDC, MERCHANT);
  const result = evaluate(policy, input(fx, sim, { history, requestKey: "GET /report?page=2" }));
  assert.equal(result.decision, "BLOCK");
  assert.ok(codes(result).includes("OVER_DAILY_BUDGET"));
});

test("attack 1, micro-drain: a single $0.99 page is over the per-payment limit", () => {
  const { fx, sim } = payment(usdc(0.99), ATTACKER_USDC, ATTACKER);
  const result = evaluate(policy, input(fx, sim));
  assert.equal(result.decision, "BLOCK");
  assert.ok(codes(result).includes("OVER_PER_PAYMENT_LIMIT"));
});

test("attack 2, swapped payee: unknown payee goes to review", () => {
  const { fx, sim } = payment(usdc(0.01), ATTACKER_USDC, ATTACKER);
  const result = evaluate(policy, input(fx, sim));
  assert.equal(result.decision, "REVIEW");
  assert.deepEqual(codes(result), ["UNKNOWN_PAYEE"]);
});

test("attack 3, price creep: $0.95 to the real merchant is blocked and flagged", () => {
  const { fx, sim } = payment(usdc(0.95), MERCHANT_USDC, MERCHANT);
  const result = evaluate(policy, input(fx, sim));
  assert.equal(result.decision, "BLOCK");
  assert.ok(codes(result).includes("OVER_PER_PAYMENT_LIMIT"));
  assert.ok(codes(result).includes("PRICE_ABOVE_USUAL"));
});

test("attack 3, price creep below the limit: $0.30 goes to review as above the usual price", () => {
  const { fx, sim } = payment(usdc(0.3), MERCHANT_USDC, MERCHANT);
  const result = evaluate(policy, input(fx, sim));
  assert.equal(result.decision, "REVIEW");
  assert.deepEqual(codes(result), ["PRICE_ABOVE_USUAL"]);
});

test("attack 4, double charge: paying again for the same request goes to review", () => {
  const history: PaymentRecord[] = [
    { timestamp: NOW - 20_000, payee: MERCHANT, amount: usdc(0.01), requestKey: "GET /fx-rate?pair=USD-KES" },
  ];
  const { fx, sim } = payment(usdc(0.01), MERCHANT_USDC, MERCHANT);
  const result = evaluate(policy, input(fx, sim, { history }));
  assert.equal(result.decision, "REVIEW");
  assert.deepEqual(codes(result), ["DUPLICATE_REQUEST"]);
});

test("attack 5, prompt injection: $0.90 to a never-seen payee is blocked", () => {
  const { fx, sim } = payment(usdc(0.9), ATTACKER_USDC, ATTACKER);
  const result = evaluate(policy, input(fx, sim, { requestKey: "GET /premium-rate" }));
  assert.equal(result.decision, "BLOCK");
  assert.ok(codes(result).includes("OVER_PER_PAYMENT_LIMIT"));
  assert.ok(codes(result).includes("UNKNOWN_PAYEE"));
});

test("attack 6, compromised client: an approval instead of a payment is blocked", () => {
  const { fx, sim } = payment(usdc(0.01), MERCHANT_USDC, MERCHANT);
  fx.transfers = [];
  fx.approvals = [{ account: AGENT_USDC, delegate: ATTACKER, owner: AGENT, amount: usdc(2) }];
  sim.changes[0]!.delegate = { before: undefined, after: ATTACKER };
  sim.changes[0]!.amount = { before: usdc(20), after: usdc(20) };
  const result = evaluate(policy, input(fx, sim));
  assert.equal(result.decision, "BLOCK");
  assert.ok(codes(result).includes("APPROVAL_PRESENT"));
  assert.ok(codes(result).includes("NOT_EXACTLY_ONE_TRANSFER"));
  assert.ok(codes(result).includes("UNEXPECTED_EFFECT"));
});

test("attack 6, hidden ownership change alongside an honest payment is blocked", () => {
  const { fx, sim } = payment(usdc(0.01), MERCHANT_USDC, MERCHANT);
  fx.authorityChanges = [{ account: AGENT_USDC, currentAuthority: AGENT, authorityType: 2, newAuthority: ATTACKER }];
  sim.changes[0]!.owner = { before: AGENT, after: ATTACKER };
  const result = evaluate(policy, input(fx, sim));
  assert.equal(result.decision, "BLOCK");
  assert.ok(codes(result).includes("AUTHORITY_CHANGE"));
  assert.ok(codes(result).includes("UNEXPECTED_EFFECT"));
});

test("attack 7, limits switched off: the agent cannot change Oversign's limits", () => {
  const { fx, sim } = payment(usdc(3), ATTACKER_USDC, ATTACKER);
  const result = evaluate(policy, input(fx, sim, { requestKey: "GET /export" }));
  assert.equal(result.decision, "BLOCK");
  assert.ok(codes(result).includes("OVER_PER_PAYMENT_LIMIT"));
  assert.ok(codes(result).includes("OVER_DAILY_BUDGET"));
});

test("unknown program in the transaction is blocked", () => {
  const { fx, sim } = payment(usdc(0.01), MERCHANT_USDC, MERCHANT);
  fx.instructions.push({ index: 4, kind: "unknown", program: "Stake11111111111111111111111111111111111111", summary: "" });
  fx.unknownPrograms = ["Stake11111111111111111111111111111111111111"];
  const result = evaluate(policy, input(fx, sim));
  assert.equal(result.decision, "BLOCK");
  assert.deepEqual(codes(result), ["UNKNOWN_PROGRAM"]);
});

test("failed or missing simulation is blocked", () => {
  const { fx } = payment(usdc(0.01), MERCHANT_USDC, MERCHANT);
  const failed = evaluate(policy, input(fx, { ok: false, error: "InvalidInstructionData", logs: [], changes: [] }));
  assert.equal(failed.decision, "BLOCK");
  assert.ok(codes(failed).includes("SIMULATION_FAILED"));
  const missing = evaluate(policy, input(fx, undefined));
  assert.equal(missing.decision, "BLOCK");
  assert.ok(codes(missing).includes("SIMULATION_MISSING"));
});

test("frozen agent is blocked even for an honest payment", () => {
  const { fx, sim } = payment(usdc(0.01), MERCHANT_USDC, MERCHANT);
  const result = evaluate(policy, input(fx, sim, { frozen: true }));
  assert.equal(result.decision, "BLOCK");
  assert.deepEqual(codes(result), ["AGENT_FROZEN"]);
});

test("the same input always gives the same decision", () => {
  const { fx, sim } = payment(usdc(0.3), MERCHANT_USDC, MERCHANT);
  const first = evaluate(policy, input(fx, sim));
  const second = evaluate(policy, input(fx, sim));
  assert.deepEqual(first, second);
});
