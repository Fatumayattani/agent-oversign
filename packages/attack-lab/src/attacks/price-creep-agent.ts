import { ATTACK_URL, loadSigner } from "../config.js";
import { createStandardAgent, explorerTx } from "../standard-client.js";
import { usdcBalance } from "../usdc.js";

// The agent normally pays $0.01 for this lookup. The standard client has no idea
// what a fair price is, only that $0.95 is under its $1 cap.
const USUAL_PRICE_USD = 0.01;

async function main(): Promise<void> {
  const agent = await createStandardAgent();
  const merchant = await loadSigner("merchant");
  const before = await usdcBalance(merchant.address);

  console.log(`Attack 3: price creep. Agent ${agent.address} looks up USD-KES, usually $0.01.\n`);
  const result = await agent.pay(`${ATTACK_URL}/fx-rate?pair=USD-KES`);
  console.log(`Status: ${result.status} ${result.error ?? ""}`.trim());
  if (result.transaction) {
    console.log(explorerTx(result.transaction));
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const charged = (await usdcBalance(merchant.address)) - before;

  console.log(`\nUsual price: $${USUAL_PRICE_USD.toFixed(2)}`);
  console.log(`Charged:     $${charged.toFixed(2)} (${Math.round(charged / USUAL_PRICE_USD)}x the usual price)`);
  if (charged > USUAL_PRICE_USD) {
    console.log("The standard client paid. It only knows the $1 cap, not what this API normally costs.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
