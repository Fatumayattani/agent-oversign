import express, { type NextFunction, type Request, type Response } from "express";
import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { loadPolicy } from "@agent-oversign/core";
import { AGENT_TOKEN, OVERSIGN_PORT, OWNER_TOKEN, POLICY_PATH, RPC_URL, loadSigner } from "./config.js";
import { createGuardedSigner, type GuardContext } from "./guard.js";
import { addApproval, isFrozen, loadDecisions, setFrozen, updateDecision } from "./store.js";

function requireToken(expected: () => string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.headers.authorization !== `Bearer ${expected()}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
}

async function main(): Promise<void> {
  const agent = await loadSigner("agent");
  const attestor = await loadSigner("attestor");
  const policy = loadPolicy(POLICY_PATH);
  AGENT_TOKEN();
  OWNER_TOKEN();

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, agent: agent.address, attestor: attestor.address, policyHash: policy.hash, frozen: isFrozen() });
  });

  // The agent's only way to pay. It sends a URL and its token, never a key.
  app.post("/pay", requireToken(AGENT_TOKEN), async (req, res) => {
    const url = String(req.body?.url ?? "");
    const method = String(req.body?.method ?? "GET").toUpperCase();
    if (!url) {
      res.status(400).json({ error: "url is required" });
      return;
    }

    const context: GuardContext = { requestKey: `${method} ${url}`, url };
    const client = new x402Client();
    client.register("solana:*", new ExactSvmScheme(createGuardedSigner(agent, attestor, policy, context), { rpcUrl: RPC_URL }));
    // The client's own limits live in the same process as the agent's code. Oversign's
    // policy is the authority instead, enforced at the signer.
    client.setSpendControls(false);
    const fetchWithPayment = wrapFetchWithPayment(fetch, client);

    try {
      const response = await fetchWithPayment(url, { method });
      const body = await response.text();
      const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
      const paymentRequired = response.headers.get("PAYMENT-REQUIRED");
      const settlement = paymentResponse ? decodePaymentResponseHeader(paymentResponse) : undefined;
      const record = context.outcome?.record;

      if (record && settlement?.transaction) {
        updateDecision(record.id, { settlementTransaction: settlement.transaction });
      }

      res.json({
        status: response.status,
        body,
        decision: record?.decision ?? "NO_PAYMENT",
        approvedByOwner: record?.approvedByOwner ?? false,
        reasons: record?.reasons ?? [],
        recordId: record?.id,
        settled: settlement?.success ?? false,
        transaction: settlement?.transaction,
        error: settlement?.errorReason ?? (paymentRequired ? decodePaymentRequiredHeader(paymentRequired).error : undefined),
      });
    } catch (error) {
      const outcome = context.outcome;
      if (outcome && !outcome.signed) {
        res.json({
          status: 402,
          body: "",
          decision: outcome.record.decision,
          approvedByOwner: false,
          reasons: outcome.record.reasons,
          recordId: outcome.record.id,
          settled: false,
        });
        return;
      }
      res.status(502).json({ error: (error as Error).message });
    }
  });

  app.get("/decisions", requireToken(OWNER_TOKEN), (_req, res) => {
    res.json(loadDecisions().reverse());
  });

  // Owner approves one REVIEW payment. The agent then retries the same request.
  app.post("/approvals/:id/approve", requireToken(OWNER_TOKEN), (req, res) => {
    const record = loadDecisions().find((item) => item.id === req.params.id);
    if (!record || record.decision !== "REVIEW" || !record.payment) {
      res.status(404).json({ error: "no REVIEW decision with that id" });
      return;
    }
    addApproval(record.id, { requestKey: record.requestKey, payee: record.payment.payee, amount: record.payment.amount });
    res.json({ approved: true, id: record.id });
  });

  // Kill switch: while frozen, every payment is blocked.
  app.post("/freeze", requireToken(OWNER_TOKEN), (_req, res) => {
    setFrozen(true);
    res.json({ frozen: true });
  });
  app.post("/unfreeze", requireToken(OWNER_TOKEN), (_req, res) => {
    setFrozen(false);
    res.json({ frozen: false });
  });

  app.listen(OVERSIGN_PORT, () => {
    console.log(`Oversign listening on http://localhost:${OVERSIGN_PORT}`);
    console.log(`Agent wallet (key held here only): ${agent.address}`);
    console.log(`Attestor: ${attestor.address}`);
    console.log(`Policy: ${policy.policy.agent} ${policy.hash.slice(0, 16)}...`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
