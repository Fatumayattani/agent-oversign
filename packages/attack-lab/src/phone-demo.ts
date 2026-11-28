import { createInterface } from "node:readline/promises";
import { MERCHANT_URL } from "./config.js";
import { createOversignAgent, type OversignResult } from "./oversign-client.js";

// The phone demo: the agent pays once, then repeats the same request, which Oversign
// holds. The owner approves it on their phone, signing with their wallet, and the
// agent's retry goes through. Nothing here can approve on the owner's behalf.
function show(label: string, result: OversignResult) {
  console.log(`\n${label}`);
  console.log(`  Decision: ${result.decision}${result.approvedByOwner ? " (approved by owner)" : ""}`);
  for (const reason of result.reasons) console.log(`    ${reason.decision} ${reason.code}: ${reason.message}`);
  console.log(`  HTTP ${result.status}, settled: ${result.settled}`);
  if (result.transaction) console.log(`  https://explorer.solana.com/tx/${result.transaction}?cluster=devnet`);
}

async function main() {
  const agent = createOversignAgent();
  const url = `${MERCHANT_URL}/fx-rate?pair=USD-KES`;

  show("1. The agent buys a USD-KES rate", await agent.pay(url));

  const held = await agent.pay(url);
  show("2. It asks for the same rate again", held);
  if (held.decision !== "REVIEW") {
    console.log("\nExpected this one to be held. Wait 5 minutes for the repeat window to clear, then run again.");
    return;
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  await prompt.question("\n   Approve it on your phone, then press Enter here to let the agent retry. ");
  prompt.close();

  const retry = await agent.pay(url);
  show("3. The agent retries", retry);
  if (retry.decision === "REVIEW" && !retry.approvedByOwner) {
    console.log("\nStill held. Check the Oversign terminal: it says why it didn't accept the approval.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
