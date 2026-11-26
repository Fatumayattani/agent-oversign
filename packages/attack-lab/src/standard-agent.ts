import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { MERCHANT_URL, RPC_URL, loadSigner } from "./config.js";

// The baseline: an agent using the standard x402 client with its default spend controls.
async function main(): Promise<void> {
  const target = process.argv[2] ?? `${MERCHANT_URL}/weather`;
  const agent = await loadSigner("agent");

  const client = new x402Client();
  client.register("solana:*", new ExactSvmScheme(agent, { rpcUrl: RPC_URL }));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  console.log(`Agent ${agent.address} requesting ${target}`);
  const response = await fetchWithPayment(target);
  const body = await response.text();

  console.log(`Status: ${response.status}`);
  console.log(`Body: ${body}`);

  const header = response.headers.get("PAYMENT-RESPONSE");
  if (header) {
    const settlement = decodePaymentResponseHeader(header);
    console.log(`Settled: ${settlement.success}`);
    console.log(`https://explorer.solana.com/tx/${settlement.transaction}?cluster=devnet`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
