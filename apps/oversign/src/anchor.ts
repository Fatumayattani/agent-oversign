import {
  address,
  appendTransactionMessageInstruction,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type KeyPairSigner,
  type Signature,
} from "@solana/kit";
import { MEMO_PROGRAM } from "@agent-oversign/core";
import { RPC_URL } from "./config.js";

const rpc = createSolanaRpc(RPC_URL);
export const ANCHOR_PREFIX = "oversign:v1:";

// Writes the record hash to Solana in a memo signed by the attestor. Once confirmed,
// the record cannot be changed without the change being visible.
export async function anchorRecordHash(attestor: KeyPairSigner, recordHash: string): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(attestor, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) =>
      appendTransactionMessageInstruction(
        { programAddress: address(MEMO_PROGRAM), data: new TextEncoder().encode(`${ANCHOR_PREFIX}${recordHash}`) },
        m,
      ),
  );
  const signed = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signed);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: "base64" }).send();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new Error(`Anchor transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return signature;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Anchor transaction was not confirmed in time.");
}

// Reads the memo back from the chain, for verification.
export async function readAnchoredHash(signature: string): Promise<string | undefined> {
  const transaction = await rpc
    .getTransaction(signature as Signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 })
    .send();
  const logs = transaction?.meta?.logMessages ?? [];
  const memoLog = logs.find((line) => line.includes(ANCHOR_PREFIX));
  const match = memoLog?.match(/oversign:v1:([0-9a-f]{64})/);
  return match?.[1];
}
