import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type { PaymentRecord } from "@agent-oversign/core";
import { DATA_DIR } from "./config.js";
import type { DecisionRecord } from "./records.js";

// Local storage for the hackathon build. The dashboard PR moves this to Supabase.
const PAYMENTS_FILE = `${DATA_DIR}payments.json`;
const DECISIONS_FILE = `${DATA_DIR}decisions.jsonl`;

type StoredPayment = Omit<PaymentRecord, "amount"> & { amount: string };

export function loadHistory(): PaymentRecord[] {
  if (!existsSync(PAYMENTS_FILE)) return [];
  const stored = JSON.parse(readFileSync(PAYMENTS_FILE, "utf8")) as StoredPayment[];
  return stored.map((item) => ({ ...item, amount: BigInt(item.amount) }));
}

export function recordPayment(payment: PaymentRecord): void {
  const history = loadHistory();
  history.push(payment);
  const stored: StoredPayment[] = history.map((item) => ({ ...item, amount: item.amount.toString() }));
  writeFileSync(PAYMENTS_FILE, JSON.stringify(stored, null, 2));
}

export function appendDecision(record: DecisionRecord): void {
  appendFileSync(DECISIONS_FILE, `${JSON.stringify(record)}\n`);
}

export function loadDecisions(): DecisionRecord[] {
  if (!existsSync(DECISIONS_FILE)) return [];
  return readFileSync(DECISIONS_FILE, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as DecisionRecord);
}

export function updateDecision(id: string, update: Partial<DecisionRecord>): void {
  const records = loadDecisions().map((record) => (record.id === id ? { ...record, ...update } : record));
  writeFileSync(DECISIONS_FILE, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
}

// Owner approvals for REVIEW decisions. An approval covers one payment: the same
// request, payee and amount, within ten minutes.
export type Approval = { requestKey: string; payee: string; amount: string; approvedAt: number; used: boolean };
const approvals = new Map<string, Approval>();
const APPROVAL_TTL_MS = 10 * 60 * 1000;

export function addApproval(id: string, approval: Omit<Approval, "approvedAt" | "used">): void {
  approvals.set(id, { ...approval, approvedAt: Date.now(), used: false });
}

export function takeApproval(requestKey: string, payee: string, amount: bigint): boolean {
  for (const approval of approvals.values()) {
    const fresh = Date.now() - approval.approvedAt < APPROVAL_TTL_MS;
    if (!approval.used && fresh && approval.requestKey === requestKey && approval.payee === payee && approval.amount === amount.toString()) {
      approval.used = true;
      return true;
    }
  }
  return false;
}

let frozen = false;
export const isFrozen = () => frozen;
export const setFrozen = (value: boolean) => {
  frozen = value;
};
