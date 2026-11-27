import { readAnchoredHash } from "./anchor.js";
import { verifyRecord } from "./records.js";
import { getDecision, latestDecision } from "./store.js";

// Anyone with the record can check it: the hash matches the contents, the attestor
// signed that hash, and the same hash was written to Solana.
async function main(): Promise<void> {
  const target = process.argv[2] ?? "latest";
  const record = target === "latest" ? await latestDecision() : await getDecision(target);
  if (!record) {
    console.log(`No decision record found for "${target}".`);
    process.exit(1);
  }

  console.log(`Record ${record.id}`);
  console.log(`  Decision: ${record.decision}${record.approvedByOwner ? " (approved by owner)" : ""}`);
  console.log(`  Reasons: ${record.reasons.map((reason) => reason.code).join(", ") || "none"}`);
  console.log(`  Policy hash: ${record.policyHash}`);

  const { hashMatches, signatureValid } = await verifyRecord(record);
  console.log(`  Contents match record hash: ${hashMatches ? "yes" : "NO"}`);
  console.log(`  Attestor signature valid: ${signatureValid ? "yes" : "NO"}`);

  if (!record.anchorTransaction) {
    console.log("  Onchain anchor: not written yet");
    return;
  }
  const anchored = await readAnchoredHash(record.anchorTransaction);
  console.log(`  Onchain anchor matches: ${anchored === record.recordHash ? "yes" : "NO"}`);
  console.log(`  https://explorer.solana.com/tx/${record.anchorTransaction}?cluster=devnet`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
