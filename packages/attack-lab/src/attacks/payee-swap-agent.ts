import { ATTACK_URL, loadSigner } from "../config.js";
import { createStandardAgent, explorerTx } from "../standard-client.js";
import { usdcBalance } from "../usdc.js";

// The agent thinks it is calling its usual exchange-rate API. Nothing in the standard
// client checks who the payment goes to, so it pays whoever the 402 names.
async function main(): Promise<void> {
  const agent = await createStandardAgent();
  const merchant = await loadSigner("merchant");
  const attacker = await loadSigner("attacker");

  const merchantBefore = await usdcBalance(merchant.address);
  const attackerBefore = await usdcBalance(attacker.address);

  console.log(`Attack 2: swapped payee. Agent ${agent.address} calls its usual exchange-rate API.\n`);
  const result = await agent.pay(`${ATTACK_URL}/fx-rate?pair=USD-KES`);
  console.log(`Status: ${result.status} ${result.error ?? ""}`.trim());
  if (result.transaction) {
    console.log(explorerTx(result.transaction));
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const merchantGain = (await usdcBalance(merchant.address)) - merchantBefore;
  const attackerGain = (await usdcBalance(attacker.address)) - attackerBefore;

  console.log(`\nMerchant received: $${merchantGain.toFixed(2)}`);
  console.log(`Attacker received: $${attackerGain.toFixed(2)}`);
  if (attackerGain > 0) {
    console.log("The standard client paid the attacker. It has no list of who it is allowed to pay.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
