import { createHash, randomUUID } from "node:crypto";
import {
  getBase58Decoder,
  getBase58Encoder,
  getPublicKeyFromAddress,
  signBytes,
  verifySignature,
  address,
  type KeyPairSigner,
  type SignatureBytes,
} from "@solana/kit";
import type { Evaluation } from "@agent-oversign/core";

// A decision record says what Oversign decided, why, and under which policy.
// Its hash is signed by the attestor and written onchain, so anyone can later check
// the record was not changed after the fact.
export type DecisionBody = {
  id: string;
  timestamp: number;
  agent: string;
  requestKey: string;
  url: string;
  decision: Evaluation["decision"];
  reasons: Evaluation["reasons"];
  payment: { payee: string; payeeName?: string; amount: string; mint?: string } | null;
  policyHash: string;
  transactionMessageHash: string;
  approvedByOwner: boolean;
};

export type DecisionRecord = DecisionBody & {
  recordHash: string;
  attestor: string;
  signature: string;
  anchorTransaction?: string;
  settlementTransaction?: string;
};

// Same bytes every time for the same record: keys sorted, bigints as strings.
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(typeof value === "bigint" ? value.toString() : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

export function sha256Hex(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function buildBody(input: {
  agent: string;
  requestKey: string;
  url: string;
  evaluation: Evaluation;
  messageBytes: Uint8Array;
  approvedByOwner: boolean;
}): DecisionBody {
  const { evaluation } = input;
  return {
    id: randomUUID(),
    timestamp: Date.now(),
    agent: input.agent,
    requestKey: input.requestKey,
    url: input.url,
    decision: evaluation.decision,
    reasons: evaluation.reasons,
    payment: evaluation.payment
      ? { ...evaluation.payment, amount: evaluation.payment.amount.toString() }
      : null,
    policyHash: evaluation.policy.hash,
    transactionMessageHash: sha256Hex(input.messageBytes),
    approvedByOwner: input.approvedByOwner,
  };
}

export async function signBody(body: DecisionBody, attestor: KeyPairSigner): Promise<DecisionRecord> {
  const recordHash = sha256Hex(canonicalJson(body));
  const signature = await signBytes(attestor.keyPair.privateKey, new TextEncoder().encode(recordHash));
  return {
    ...body,
    recordHash,
    attestor: attestor.address,
    signature: getBase58Decoder().decode(signature),
  };
}

// Checks the record against its own hash and the attestor's signature.
export async function verifyRecord(record: DecisionRecord): Promise<{ hashMatches: boolean; signatureValid: boolean }> {
  const { recordHash, attestor, signature, anchorTransaction, settlementTransaction, ...body } = record;
  void anchorTransaction;
  void settlementTransaction;
  const hashMatches = sha256Hex(canonicalJson(body)) === recordHash;
  const publicKey = await getPublicKeyFromAddress(address(attestor));
  const signatureValid = await verifySignature(
    publicKey,
    getBase58Encoder().encode(signature) as SignatureBytes,
    new TextEncoder().encode(recordHash),
  );
  return { hashMatches, signatureValid };
}
