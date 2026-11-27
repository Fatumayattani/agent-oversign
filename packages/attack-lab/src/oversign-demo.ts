import { ATTACK_URL, MERCHANT_URL, loadSigner } from "./config.js";
import { createOversignAgent, ownerApprove, type OversignResult } from "./oversign-client.js";
import { explorerTx } from "./standard-client.js";
import { usdcBalance } from "./usdc.js";

// The same agent requests, now going through Oversign instead of holding the key.
// Needs three things running: Oversign, the honest merchant, and the price-creep server.
function show(label: string, result: OversignResult): void {
  console.log(`\n${label}`);
  console.log(`  Decision: ${result.decision}${result.approvedByOwner ? " (approved by owner)" : ""}`);
  for (const reason of result.reasons) {
    console.log(`    ${reason.decision} ${reason.code}: ${reason.message}`);
  }
  console.log(`  HTTP ${result.status}, settled: ${result.settled}${result.error ? `, ${result.error}` : ""}`);
  if (result.transaction) console.log(`  ${explorerTx(result.transaction)}`);
  if (result.recordId) console.log(`  Record: ${result.recordId}`);
}

async function main(): Promise<void> {
  const agent = createOversignAgent();
  const merchant = await loadSigner("merchant");
  const before = await usdcBalance(merchant.address);
  const rateUrl = `${MERCHANT_URL}/fx-rate?pair=USD-KES`;

  const honest = await agent.pay(rateUrl);
  show("1. Honest $0.01 rate lookup from the listed merchant", honest);

  const creep = await agent.pay(`${ATTACK_URL}/fx-rate?pair=USD-KES`);
  show("2. Same API at $0.95 (price creep)", creep);

  const repeat = await agent.pay(rateUrl);
  show("3. The same rate request again within 5 minutes", repeat);

  if (repeat.decision === "REVIEW" && repeat.recordId) {
    console.log("\n   Owner approves this one payment (the phone app will do this later).");
    await ownerApprove(repeat.recordId);
    const retried = await agent.pay(rateUrl);
    show("4. Agent retries after the owner's approval", retried);
  }

  await new Promise((resolve) => setTimeout(resolve, 5000));
  const received = (await usdcBalance(merchant.address)) - before;
  console.log(`\nMerchant received: $${received.toFixed(2)} (the $0.95 price-creep payment was never signed)`);
  console.log("Verify the latest record: npm run verify -w apps/oversign");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
