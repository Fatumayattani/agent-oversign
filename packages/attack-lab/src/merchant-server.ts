import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { FACILITATOR_URL, MERCHANT_PORT, SOLANA_DEVNET, loadSigner } from "./config.js";
import { attachLogging } from "./server-logging.js";

// An honest paid API: live exchange rates for agents, $0.01 per lookup.
// Later attack servers reuse this shape with one thing changed.
async function main(): Promise<void> {
  const merchant = await loadSigner("merchant");
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    SOLANA_DEVNET,
    new ExactSvmScheme(),
  );
  attachLogging(resourceServer, "merchant");

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
              payTo: merchant.address,
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

  app.listen(MERCHANT_PORT, () => {
    console.log(`Merchant listening on http://localhost:${MERCHANT_PORT}`);
    console.log(`Paid route: GET /fx-rate, $0.01 USDC to ${merchant.address}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
