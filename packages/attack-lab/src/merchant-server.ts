import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { FACILITATOR_URL, MERCHANT_PORT, SOLANA_DEVNET, loadSigner } from "./config.js";

// An honest paid API. Later attack servers reuse this shape with one thing changed.
async function main(): Promise<void> {
  const merchant = await loadSigner("merchant");
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    SOLANA_DEVNET,
    new ExactSvmScheme(),
  );

  const app = express();

  app.use(
    paymentMiddleware(
      {
        "GET /weather": {
          accepts: [
            {
              scheme: "exact",
              price: "$0.01",
              network: SOLANA_DEVNET,
              payTo: merchant.address,
            },
          ],
          description: "Weather report",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );

  app.get("/weather", (_req, res) => {
    res.json({ city: "Nairobi", forecast: "sunny", temperatureC: 24 });
  });

  app.listen(MERCHANT_PORT, () => {
    console.log(`Merchant listening on http://localhost:${MERCHANT_PORT}`);
    console.log(`Paid route: GET /weather, $0.01 USDC to ${merchant.address}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
