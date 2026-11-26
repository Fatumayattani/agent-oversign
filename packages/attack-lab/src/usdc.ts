import { address, createSolanaRpc } from "@solana/kit";
import { RPC_URL } from "./config.js";

const USDC_MINT = address(process.env.USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const rpc = createSolanaRpc(RPC_URL);

// Reads a wallet's USDC balance straight from the chain, so results never rely on
// what a server or client claims happened.
export async function usdcBalance(owner: string): Promise<number> {
  const { value } = await rpc
    .getTokenAccountsByOwner(address(owner), { mint: USDC_MINT }, { encoding: "jsonParsed" })
    .send();
  return value.reduce((total, account) => {
    const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
    return total + (amount ?? 0);
  }, 0);
}
