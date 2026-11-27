import {
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Blockhash,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";
import {
  AuthorityType,
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getApproveCheckedInstruction,
  getSetAuthorityInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeMessage, writableAccounts } from "../decode.js";
import { inspectMessage } from "../inspect.js";
import { MEMO_PROGRAM } from "../programs.js";
import { simulateEffects } from "../simulate.js";

// Builds four transactions an agent's key might be asked to sign, then shows what
// Oversign sees in each: first by reading the bytes, then by simulating on devnet.
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
try {
  process.loadEnvFile(`${ROOT}.env`);
} catch {
  // Defaults below are used.
}

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_MINT = address(process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const OFFLINE = process.argv.includes("--offline");
const UNKNOWN_PROGRAM = address("Stake11111111111111111111111111111111111111");

async function loadSigner(role: string): Promise<KeyPairSigner> {
  const secret = JSON.parse(readFileSync(`${ROOT}.keys/${role}.json`, "utf8")) as number[];
  return createKeyPairSignerFromBytes(Uint8Array.from(secret));
}

function memo(text: string): Instruction {
  return { programAddress: address(MEMO_PROGRAM), data: new TextEncoder().encode(text) };
}

function format(value: unknown): string {
  return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2);
}

async function main(): Promise<void> {
  const rpc = createSolanaRpc(RPC_URL);
  const agent = await loadSigner("agent");
  const merchant = await loadSigner("merchant");
  const attacker = await loadSigner("attacker");

  const [agentUsdc] = await findAssociatedTokenPda({ owner: agent.address, mint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ADDRESS });
  const [merchantUsdc] = await findAssociatedTokenPda({ owner: merchant.address, mint: USDC_MINT, tokenProgram: TOKEN_PROGRAM_ADDRESS });

  const computeBudget = [
    getSetComputeUnitLimitInstruction({ units: 40_000 }),
    getSetComputeUnitPriceInstruction({ microLamports: 1n }),
  ];
  const payMerchant = getTransferCheckedInstruction({
    source: agentUsdc,
    mint: USDC_MINT,
    destination: merchantUsdc,
    authority: agent,
    amount: 10_000n,
    decimals: 6,
  });

  const cases: { name: string; instructions: Instruction[] }[] = [
    {
      name: "1. Honest x402 payment ($0.01 to merchant)",
      instructions: [...computeBudget, payMerchant, memo("x402-demo-nonce")],
    },
    {
      name: "2. Approval instead of payment ($2 delegate to attacker)",
      instructions: [
        ...computeBudget,
        getApproveCheckedInstruction({
          source: agentUsdc,
          mint: USDC_MINT,
          delegate: attacker.address,
          owner: agent,
          amount: 2_000_000n,
          decimals: 6,
        }),
        memo("x402-demo-nonce"),
      ],
    },
    {
      name: "3. Honest payment plus hidden ownership change to attacker",
      instructions: [
        ...computeBudget,
        payMerchant,
        getSetAuthorityInstruction({
          owned: agentUsdc,
          owner: agent,
          authorityType: AuthorityType.AccountOwner,
          newAuthority: attacker.address,
        }),
        memo("x402-demo-nonce"),
      ],
    },
    {
      name: "4. Honest payment plus a call to a program not on any allowlist",
      instructions: [
        ...computeBudget,
        payMerchant,
        { programAddress: UNKNOWN_PROGRAM, data: new Uint8Array([9, 9, 9]) },
        memo("x402-demo-nonce"),
      ],
    },
  ];

  const blockhash = OFFLINE
    ? { blockhash: "11111111111111111111111111111111" as Blockhash, lastValidBlockHeight: 0n }
    : (await rpc.getLatestBlockhash().send()).value;

  for (const testCase of cases) {
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(agent, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
      (m) => appendTransactionMessageInstructions(testCase.instructions, m),
    );
    const transaction = compileTransaction(message);
    const decoded = await decodeMessage(new Uint8Array(transaction.messageBytes), rpc);
    const staticEffects = inspectMessage(decoded);

    console.log(`\n=== ${testCase.name} ===`);
    console.log("What the bytes say:");
    staticEffects.instructions.forEach((item) => console.log(`  [${item.index}] ${item.summary}`));
    if (staticEffects.unknownPrograms.length > 0) {
      console.log(`  Unknown programs: ${staticEffects.unknownPrograms.join(", ")}`);
    }

    if (OFFLINE) continue;

    const simulated = await simulateEffects(rpc, getBase64EncodedWireTransaction(transaction), writableAccounts(decoded));
    console.log(`What the chain says (simulation ${simulated.ok ? "succeeded" : `failed: ${simulated.error}`}):`);
    if (!simulated.ok) {
      console.log("  No effects reported. The transaction would fail onchain, and a failed simulation is treated as a block.");
    }
    for (const change of simulated.changes) {
      if (!change.amount) continue;
      const parts: string[] = [];
      const delta = change.amount.after - change.amount.before;
      if (delta !== 0n) parts.push(`balance ${delta > 0n ? "+" : ""}${delta}`);
      if (change.delegate?.before !== change.delegate?.after) parts.push(`delegate ${change.delegate?.before ?? "none"} -> ${change.delegate?.after ?? "none"}`);
      if (change.owner?.before !== change.owner?.after) parts.push(`owner ${change.owner?.before} -> ${change.owner?.after}`);
      console.log(`  ${change.account}: ${parts.length > 0 ? parts.join(", ") : "no change"}`);
    }
    if (process.argv.includes("--verbose")) console.log(format(staticEffects));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
