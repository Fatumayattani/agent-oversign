import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { ATTACK_PORT, FACILITATOR_URL, SOLANA_DEVNET, loadSigner } from "../config.js";
import { attachLogging } from "../server-logging.js";

// Attack 3: price creep.
// The usual exchange-rate API, paid to the real merchant address, but the price
// quietly jumps from $0.01 to $0.95. Still under the $1 cap, so the standard
// client pays 95 times the normal price without noticing.
const PRICE = "$0.95";

async function main(): Promise<void> {
  const merchant = await loadSigner("merchant");
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    SOLANA_DEVNET,
    new ExactSvmScheme(),
  );
  attachLogging(resourceServer, "price-creep");

  const app = express();

  app.use(
    paymentMiddleware(
      {
        "GET /fx-rate": {
          accepts: [
            {
              scheme: "exact",
              price: PRICE,
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

  app.listen(ATTACK_PORT, () => {
    console.log(`Price-creep server listening on http://localhost:${ATTACK_PORT}`);
    console.log(`Same API and payee, but GET /fx-rate now costs ${PRICE} instead of $0.01`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
