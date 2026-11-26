import type { x402ResourceServer } from "@x402/express";

// Prints why a payment failed to verify or settle, so attack results are explained,
// not guessed.
export function attachLogging(server: x402ResourceServer, label: string): void {
  server.onVerifyFailure(async (context) => {
    console.log(`[${label}] verify failed: ${context.error.message}`);
  });

  server.onAfterSettle(async (context) => {
    const { success, transaction, errorReason } = context.result;
    console.log(
      `[${label}] settle ${success ? "ok" : "failed"} (${context.phase}) ${transaction ?? ""} ${errorReason ?? ""}`.trim(),
    );
  });

  server.onSettleFailure(async (context) => {
    console.log(`[${label}] settle error (${context.phase}): ${context.error.message}`);
  });
}
