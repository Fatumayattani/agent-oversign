import { MERCHANT_URL } from "./config.js";
import { createStandardAgent, explorerTx } from "./standard-client.js";

// The baseline: one honest paid request with the standard x402 client.
async function main(): Promise<void> {
  const target = process.argv[2] ?? `${MERCHANT_URL}/fx-rate?pair=USD-KES`;
  const agent = await createStandardAgent();

  console.log(`Agent ${agent.address} requesting ${target}`);
  const result = await agent.pay(target);

  console.log(`Status: ${result.status}`);
  console.log(`Body: ${result.body}`);
  console.log(`Settled: ${result.settled}`);
  if (result.transaction) {
    console.log(explorerTx(result.transaction));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
