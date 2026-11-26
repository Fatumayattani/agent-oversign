import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createApproveCheckedInstruction,
  createRevokeInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RPC_URL } from "../config.js";
import { usdcBalance } from "../usdc.js";

// Attack 6: compromised client.
// A tampered payment library asks the agent's key to sign an SPL "approve" instead of
// a payment. The agent's key signs whatever bytes it is given. The attacker, now a
// delegate on the agent's USDC account, moves funds later with no further signature
// from the agent.
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const USDC_MINT = new PublicKey(
  process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
const DECIMALS = 6;
const APPROVED_USDC = 2;

function load(role: string): Keypair {
  const secret = JSON.parse(readFileSync(`${ROOT}.keys/${role}.json`, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function main(): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const agent = load("agent");
  const attacker = load("attacker");
  const owner = load("owner");

  const agentUsdc = getAssociatedTokenAddressSync(USDC_MINT, agent.publicKey);
  const attackerUsdc = getAssociatedTokenAddressSync(USDC_MINT, attacker.publicKey);
  const amount = BigInt(APPROVED_USDC * 10 ** DECIMALS);

  console.log("Attack 6: compromised client. The payment library has been tampered with.\n");

  // The attacker needs a little SOL to send its own transaction later.
  if ((await connection.getBalance(attacker.publicKey)) < 0.01 * LAMPORTS_PER_SOL) {
    await sendAndConfirmTransaction(
      connection,
      new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: owner.publicKey,
          toPubkey: attacker.publicKey,
          lamports: 0.02 * LAMPORTS_PER_SOL,
        }),
      ),
      [owner],
    );
  }

  const agentBefore = await usdcBalance(agent.publicKey.toBase58());

  // Step 1: the agent's key signs an approval it believes is a payment.
  const approveSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createApproveCheckedInstruction(
        agentUsdc,
        USDC_MINT,
        attacker.publicKey,
        agent.publicKey,
        amount,
        DECIMALS,
      ),
    ),
    [agent],
  );
  console.log(`Agent signed an approval for $${APPROVED_USDC} to the attacker:`);
  console.log(`https://explorer.solana.com/tx/${approveSig}?cluster=devnet\n`);

  // Step 2: later, the attacker moves the funds alone, signing as delegate.
  const drainSig = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(
      createTransferCheckedInstruction(
        agentUsdc,
        USDC_MINT,
        attackerUsdc,
        attacker.publicKey,
        amount,
        DECIMALS,
      ),
    ),
    [attacker],
  );
  console.log("Attacker moved the funds using only its own signature:");
  console.log(`https://explorer.solana.com/tx/${drainSig}?cluster=devnet\n`);

  // Clean up so later runs start from a known state.
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(createRevokeInstruction(agentUsdc, agent.publicKey)),
    [agent],
  );

  await new Promise((resolve) => setTimeout(resolve, 3000));
  const lost = agentBefore - (await usdcBalance(agent.publicKey.toBase58()));

  console.log(`Agent lost: $${lost.toFixed(2)}`);
  console.log("Nothing checked what the agent's key was signing. Any library bug or tampering");
  console.log("that changes the transaction bytes goes straight through.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
