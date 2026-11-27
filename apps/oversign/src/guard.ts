import {
  createSolanaRpc,
  getBase64EncodedWireTransaction,
  type KeyPairSigner,
  type TransactionPartialSigner,
} from "@solana/kit";
import {
  decodeMessage,
  evaluate,
  inspectMessage,
  simulateEffects,
  writableAccounts,
  type Evaluation,
  type LoadedPolicy,
} from "@agent-oversign/core";
import { anchorRecordHash } from "./anchor.js";
import { RPC_URL } from "./config.js";
import { buildBody, signBody, type DecisionRecord } from "./records.js";
import { appendDecision, isFrozen, loadHistory, recordPayment, takeApproval, updateDecision } from "./store.js";

const rpc = createSolanaRpc(RPC_URL);

export type GuardContext = {
  requestKey: string;
  url: string;
  outcome?: { record: DecisionRecord; evaluation: Evaluation; signed: boolean };
};

export class OversignRefusal extends Error {
  constructor(readonly record: DecisionRecord) {
    super(`Oversign ${record.decision}: ${record.reasons.map((reason) => reason.code).join(", ")}`);
  }
}

// The signing boundary. The x402 client builds the payment, but the only way to get
// a signature is through this signer, which checks the exact bytes first.
// The agent never holds the key, so it cannot skip this step.
export function createGuardedSigner(
  agent: KeyPairSigner,
  attestor: KeyPairSigner,
  policy: LoadedPolicy,
  context: GuardContext,
): TransactionPartialSigner {
  return {
    address: agent.address,
    async signTransactions(transactions, config) {
      for (const transaction of transactions) {
        const messageBytes = new Uint8Array(transaction.messageBytes);
        const decoded = await decodeMessage(messageBytes, rpc);
        const staticEffects = inspectMessage(decoded);
        const simulated = await simulateEffects(
          rpc,
          getBase64EncodedWireTransaction(transaction),
          writableAccounts(decoded),
        );
        const evaluation = evaluate(policy, {
          staticEffects,
          simulated,
          agent: agent.address,
          requestKey: context.requestKey,
          history: loadHistory(),
          frozen: isFrozen(),
        });

        // An owner approval can clear a REVIEW for this one payment. It never clears a BLOCK.
        const approvedByOwner =
          evaluation.decision === "REVIEW" &&
          evaluation.payment !== undefined &&
          takeApproval(context.requestKey, evaluation.payment.payee, evaluation.payment.amount);
        const signed = evaluation.decision === "ALLOW" || approvedByOwner;

        const record = await signBody(
          buildBody({ agent: agent.address, requestKey: context.requestKey, url: context.url, evaluation, messageBytes, approvedByOwner }),
          attestor,
        );
        appendDecision(record);
        context.outcome = { record, evaluation, signed };

        anchorRecordHash(attestor, record.recordHash)
          .then((signature) => updateDecision(record.id, { anchorTransaction: signature }))
          .catch((error: Error) => console.error(`Anchoring ${record.id} failed: ${error.message}`));

        if (!signed) {
          throw new OversignRefusal(record);
        }

        // Counted as spent the moment it is signed, because funds can move even when a
        // server later reports the settlement as pending.
        if (evaluation.payment) {
          recordPayment({
            timestamp: Date.now(),
            payee: evaluation.payment.payee,
            amount: evaluation.payment.amount,
            requestKey: context.requestKey,
          });
        }
      }
      return agent.signTransactions(transactions, config);
    },
  };
}
