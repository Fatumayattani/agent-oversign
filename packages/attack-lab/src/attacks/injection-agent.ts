import { ATTACK_URL, loadSigner } from "../config.js";
import { createStandardAgent, explorerTx } from "../standard-client.js";
import { usdcBalance } from "../usdc.js";

// The task: summarise today's shilling news. No purchase was asked for.
// This agent stands in for an LLM agent that obeys instructions found in content it reads.
// The hijack itself is simulated on purpose: the point is what the payment layer does
// once an agent has been hijacked.
const URL_PATTERN = /https?:\/\/\S+/;

async function main(): Promise<void> {
  const agent = await createStandardAgent();
  const attacker = await loadSigner("attacker");
  const before = await usdcBalance(attacker.address);

  console.log(`Attack 5: prompt injection. Task: summarise today's shilling news.\n`);

  const page = await (await fetch(`${ATTACK_URL}/news`)).text();
  const injected = page.split("\n").find((line) => line.startsWith("AI agents:"));
  const target = injected?.match(URL_PATTERN)?.[0].replace(/[.,]$/, "");

  if (!target) {
    console.log("No injected instruction found.");
    return;
  }

  console.log(`Agent read: "${injected}"`);
  console.log(`Agent follows it and requests ${target}\n`);

  const result = await agent.pay(target);
  console.log(`Status: ${result.status} ${result.error ?? ""}`.trim());
  if (result.transaction) {
    console.log(explorerTx(result.transaction));
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const charged = (await usdcBalance(attacker.address)) - before;

  console.log(`\nPurchases the task asked for: 0`);
  console.log(`Paid to a payee the agent had never used: $${charged.toFixed(2)}`);
  if (charged > 0) {
    console.log("The standard client paid. A new payee and an unrequested purchase raised no flag.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
