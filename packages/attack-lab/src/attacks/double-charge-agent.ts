import { ATTACK_URL, loadSigner } from "../config.js";
import { createStandardAgent, explorerTx } from "../standard-client.js";
import { usdcBalance } from "../usdc.js";

// A normal agent pattern: retry when the service says it is busy.
// The standard client treats every retry as a new purchase and pays again.
const MAX_ATTEMPTS = 3;
const PRICE_USD = 0.01;

async function main(): Promise<void> {
  const agent = await createStandardAgent();
  const attacker = await loadSigner("attacker");
  const before = await usdcBalance(attacker.address);

  console.log(`Attack 4: double charge. Agent ${agent.address} needs one USD-KES rate.\n`);

  let attempt = 0;
  let gotRate = false;
  while (attempt < MAX_ATTEMPTS && !gotRate) {
    attempt += 1;
    const result = await agent.pay(`${ATTACK_URL}/fx-rate?pair=USD-KES`);
    const body = JSON.parse(result.body || "{}") as { retry?: boolean; rate?: number };
    gotRate = typeof body.rate === "number";
    const outcome = gotRate ? `rate ${body.rate}` : body.retry ? "busy, retrying" : `status ${result.status}`;
    console.log(`Attempt ${attempt}: paid=${result.settled}  ${outcome}  ${result.transaction ? explorerTx(result.transaction) : ""}`.trim());
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const charged = (await usdcBalance(attacker.address)) - before;
  const payments = Math.round(charged / PRICE_USD);

  console.log(`\nWanted: 1 rate for $${PRICE_USD.toFixed(2)}`);
  console.log(`Charged: $${charged.toFixed(2)} across ${payments} payments for the same request`);
  if (payments > 1) {
    console.log("The standard client paid again on every retry. It has no idea these were the same request.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
