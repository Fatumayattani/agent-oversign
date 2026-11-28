import type { Decision } from "./types";

// The exact text the owner's wallet signs. Must match the service's copy in
// apps/oversign/src/approval.ts, which checks it before letting a payment through.
export function approvalMessage(decision: Decision): string {
  return [
    "Oversign approval",
    `Decision ${decision.id}`,
    `Record ${decision.record_hash}`,
    `Pay ${decision.payment?.amount ?? ""} base units of USDC to ${decision.payment?.payee ?? ""}`,
  ].join("\n");
}

export type ApprovalProof = { signer: string; signature: string; signedMessage: string };

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
