import { ATTACK_URL, loadSigner } from "../config.js";
import { createStandardAgent, explorerTx } from "../standard-client.js";
import { usdcBalance } from "../usdc.js";

// The standard client's limits live inside the agent process. If the agent is
// compromised, it can switch them off with one call and nothing outside notices.
async function main(): Promise<void> {
  const attacker = await loadSigner("attacker");
  const target = `${ATTACK_URL}/export`;

  console.log("Attack 7: limits switched off.\n");

  console.log("Step 1: agent with default limits requests a $3.00 export.");
  const careful = await createStandardAgent();
  try {
    const result = await careful.pay(target);
    console.log(`  Status: ${result.status} ${result.error ?? ""}`.trim());
  } catch (error) {
    console.log(`  Refused by the $1 cap: ${(error as Error).message}`);
  }

  console.log("\nStep 2: the compromised agent calls setSpendControls(false) and tries again.");
  const before = await usdcBalance(attacker.address);
  const compromised = await createStandardAgent({ disableSpendControls: true });
  const result = await compromised.pay(target);
  console.log(`  Status: ${result.status} ${result.error ?? ""}`.trim());
  if (result.transaction) {
    console.log(`  ${explorerTx(result.transaction)}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const charged = (await usdcBalance(attacker.address)) - before;

  console.log(`\nPaid to attacker after limits were switched off: $${charged.toFixed(2)}`);
  if (charged > 0) {
    console.log("The limits lived inside the agent, so the compromised agent simply removed them.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
