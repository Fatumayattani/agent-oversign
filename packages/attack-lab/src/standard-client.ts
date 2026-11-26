import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { decodePaymentResponseHeader, wrapFetchWithPayment } from "@x402/fetch";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { RPC_URL, loadSigner } from "./config.js";

export type PaidResult = {
  status: number;
  body: string;
  settled: boolean;
  transaction?: string;
  error?: string;
};

export type StandardAgentOptions = {
  // A compromised agent can switch its own limits off. The client allows it.
  disableSpendControls?: boolean;
};

// The standard x402 client exactly as the docs set it up, with default spend controls
// (USD-pegged assets only, $1 cap per payment).
export async function createStandardAgent(options: StandardAgentOptions = {}) {
  const agent = await loadSigner("agent");
  const client = new x402Client();
  client.register("solana:*", new ExactSvmScheme(agent, { rpcUrl: RPC_URL }));
  if (options.disableSpendControls) {
    client.setSpendControls(false);
  }
  const fetchWithPayment = wrapFetchWithPayment(fetch, client);

  async function pay(url: string): Promise<PaidResult> {
    const response = await fetchWithPayment(url);
    const body = await response.text();

    const paymentResponse = response.headers.get("PAYMENT-RESPONSE");
    if (paymentResponse) {
      const settlement = decodePaymentResponseHeader(paymentResponse);
      return {
        status: response.status,
        body,
        settled: settlement.success,
        transaction: settlement.transaction,
        error: settlement.errorReason,
      };
    }

    const paymentRequired = response.headers.get("PAYMENT-REQUIRED");
    const error = paymentRequired ? decodePaymentRequiredHeader(paymentRequired).error : undefined;
    return { status: response.status, body, settled: false, error };
  }

  return { address: agent.address, pay };
}

export function explorerTx(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
