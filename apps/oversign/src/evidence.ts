import type { SimulatedEffects, StaticEffects } from "@agent-oversign/core";

// What Oversign saw before deciding: the decoded instructions and what Solana said
// the transaction would do. Stored next to each decision so the owner can follow the
// whole check. The signed record already fixes the exact bytes through
// transactionMessageHash, so this evidence can always be rebuilt from them.
export type Evidence = {
  feePayer: string;
  instructions: { index: number; kind: string; program: string; summary: string }[];
  transfers: { source: string; destination: string; authority: string; mint?: string; amount: string }[];
  approvals: number;
  authorityChanges: number;
  closes: number;
  computeUnitLimit?: number;
  computeUnitPrice?: string;
  simulation: {
    ok: boolean;
    error?: string;
    unitsConsumed?: string;
    changes: {
      account: string;
      owner?: string;
      before?: string;
      after?: string;
      ownerChanged: boolean;
      delegateChanged: boolean;
      closed: boolean;
    }[];
  } | null;
  timings: { decodeMs: number; simulateMs: number; evaluateMs: number };
};

export function buildEvidence(
  fx: StaticEffects,
  simulated: SimulatedEffects | undefined,
  timings: Evidence["timings"],
): Evidence {
  return {
    feePayer: fx.feePayer,
    instructions: fx.instructions.map(({ index, kind, program, summary }) => ({ index, kind, program, summary })),
    transfers: fx.transfers.map((transfer) => ({
      source: transfer.source,
      destination: transfer.destination,
      authority: transfer.authority,
      mint: transfer.mint,
      amount: transfer.amount.toString(),
    })),
    approvals: fx.approvals.length,
    authorityChanges: fx.authorityChanges.length,
    closes: fx.closes.length,
    computeUnitLimit: fx.computeUnitLimit,
    computeUnitPrice: fx.computeUnitPriceMicroLamports?.toString(),
    simulation: simulated
      ? {
          ok: simulated.ok,
          error: simulated.error,
          unitsConsumed: simulated.unitsConsumed?.toString(),
          changes: simulated.changes.map((change) => ({
            account: change.account,
            owner: change.owner?.before ?? change.owner?.after,
            before: change.amount?.before.toString(),
            after: change.amount?.after.toString(),
            ownerChanged: Boolean(change.owner && change.owner.before !== change.owner.after),
            delegateChanged: Boolean(change.delegate && change.delegate.before !== change.delegate.after),
            closed: change.existsBefore && !change.existsAfter,
          })),
        }
      : null,
    timings,
  };
}
