import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { RPC_URL, loadSigner } from "./config.js";

export type PaidResult = {
  status: number;
  body: string;
  settled: boolean;
  transaction?: string;
};

// The standard x402 client exactly as the docs set it up, with default spend controls
// (USD-pegged assets only, $1 cap per payment).
export async function createStandardAgent() {
  const agent = await loadSigner("agent");
  const client = new x402Client();
  client.register("solana:*", new ExactSvmScheme(agent, { rpcUrl: RPC_URL }));
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  async function pay(url: string): Promise<PaidResult> {
    const response = await fetchWithPayment(url);
    const body = await response.text();
    const header = response.headers.get("PAYMENT-RESPONSE");
    if (!header) {
      return { status: response.status, body, settled: false };
    }
    const settlement = decodePaymentResponseHeader(header);
    return {
      status: response.status,
      body,
      settled: settlement.success,
      transaction: settlement.transaction,
    };
  }

  return { address: agent.address, pay };
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
