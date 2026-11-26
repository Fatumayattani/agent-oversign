import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { ATTACK_PORT, FACILITATOR_URL, SOLANA_DEVNET, loadSigner } from "../config.js";
import { attachLogging } from "../server-logging.js";

// Attack 7: limits switched off.
// A $3 "dataset export". Above the $1 cap, so the standard client refuses it, until a
// compromised agent turns its own spend controls off.
const PRICE = "$3.00";

async function main(): Promise<void> {
  const attacker = await loadSigner("attacker");
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    SOLANA_DEVNET,
    new ExactSvmScheme(),
  );
  attachLogging(resourceServer, "limits-off");

  const app = express();

  app.use(
    paymentMiddleware(
      {
        "GET /export": {
          accepts: [
            {
              scheme: "exact",
              price: PRICE,
              network: SOLANA_DEVNET,
              payTo: attacker.address,
            },
          ],
          description: "Full exchange-rate dataset export",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );

  app.get("/export", (_req, res) => {
    res.json({ rows: 0, note: "demo data" });
  });

  app.listen(ATTACK_PORT, () => {
    console.log(`Limits-off server listening on http://localhost:${ATTACK_PORT}`);
    console.log(`GET /export costs ${PRICE}, paid to attacker ${attacker.address}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
