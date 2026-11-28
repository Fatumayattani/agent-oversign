import type { Approval, Decision } from "./types";

// USDC has 6 decimals. Amounts arrive as base-unit strings so nothing is lost.
export function toUsd(baseUnits: string | undefined | null): number {
  if (!baseUnits) return 0;
  return Number(BigInt(baseUnits)) / 1_000_000;
}

export function usd(value: number): string {
  const digits = value !== 0 && Math.abs(value) < 0.01 ? 4 : 2;
  return `$${value.toFixed(digits)}`;
}

export function short(value: string, head = 4, tail = 4): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function ago(iso: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function requestLabel(url: string): { host: string; path: string } {
  try {
    const parsed = new URL(url);
    return { host: parsed.host, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { host: "", path: url };
  }
}

export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
export const explorerAddress = (address: string) => `https://explorer.solana.com/address/${address}?cluster=devnet`;

// Must match the service: an approval covers one retry within ten minutes.
export const APPROVAL_TTL_MS = 10 * 60 * 1000;

export type Status =
  | { kind: "allowed"; label: "Allowed" }
  | { kind: "approved"; label: "Approved by you" }
  | { kind: "blocked"; label: "Blocked" }
  | { kind: "held"; label: "Held for you" }
  | { kind: "waiting"; label: "Approved, waiting for retry" }
  | { kind: "released"; label: "Approved and paid" }
  | { kind: "expired"; label: "Approval expired" };

export function statusOf(decision: Decision, approval: Approval | undefined, now: number): Status {
  if (decision.decision === "ALLOW") return { kind: "allowed", label: "Allowed" };
  if (decision.decision === "BLOCK") return { kind: "blocked", label: "Blocked" };
  if (decision.approved_by_owner) return { kind: "approved", label: "Approved by you" };
  if (!approval) return { kind: "held", label: "Held for you" };
  if (approval.used_at) return { kind: "released", label: "Approved and paid" };
  if (now - new Date(approval.approved_at).getTime() > APPROVAL_TTL_MS) {
    return { kind: "expired", label: "Approval expired" };
  }
  return { kind: "waiting", label: "Approved, waiting for retry" };
}
