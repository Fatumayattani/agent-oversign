import { address, getPublicKeyFromAddress } from "@solana/kit";
import { verifySignature, type SignatureBytes } from "@solana/kit";

// The exact text the owner's wallet signs to approve one held payment. It names the
// decision, its signed record and the payment, so a signature can't be reused for a
// different payment. The dashboard builds the same text (apps/dashboard/lib/approval.ts).
export function approvalMessage(decisionId: string, recordHash: string, payee: string, amount: string): string {
  return [
    "Oversign approval",
    `Decision ${decisionId}`,
    `Record ${recordHash}`,
    `Pay ${amount} base units of USDC to ${payee}`,
  ].join("\n");
}

export type WalletApproval = {
  decisionId: string;
  recordHash: string;
  payee: string;
  amount: string;
  signer: string | null;
  signature: string | null;
  signedMessage: string | null;
};

// True only if the owner's wallet signed exactly this approval.
export async function verifyWalletApproval(approval: WalletApproval, ownerWallet: string): Promise<boolean> {
  if (!approval.signer || !approval.signature || !approval.signedMessage) return false;
  if (approval.signer !== ownerWallet) return false;

  const signedBytes = Buffer.from(approval.signedMessage, "base64");
  const expected = approvalMessage(approval.decisionId, approval.recordHash, approval.payee, approval.amount);
  if (signedBytes.toString("utf8") !== expected) return false;

  const signature = Uint8Array.from(Buffer.from(approval.signature, "base64"));
  if (signature.length !== 64) return false;
  try {
    const key = await getPublicKeyFromAddress(address(ownerWallet));
    return await verifySignature(key, signature as SignatureBytes, new Uint8Array(signedBytes));
  } catch {
    return false;
  }
}
