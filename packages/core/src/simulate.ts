import { address, type Base64EncodedWireTransaction, type GetMultipleAccountsApi, type Rpc, type SimulateTransactionApi } from "@solana/kit";
import { isTokenProgram } from "./programs.js";
import type { SimulatedEffects, WatchedAccountChange } from "./types.js";

type ParsedTokenInfo = {
  owner?: string;
  delegate?: string;
  tokenAmount?: { amount: string };
  delegatedAmount?: { amount: string };
};

type ParsedAccount = {
  owner: string;
  data: unknown;
} | null;

function tokenInfo(account: ParsedAccount): ParsedTokenInfo | undefined {
  if (!account || !isTokenProgram(account.owner)) return undefined;
  const data = account.data as { parsed?: { type?: string; info?: ParsedTokenInfo } };
  return data?.parsed?.type === "account" ? data.parsed.info : undefined;
}

function compare(account: string, before: ParsedAccount, after: ParsedAccount): WatchedAccountChange {
  const pre = tokenInfo(before);
  const post = tokenInfo(after);
  const change: WatchedAccountChange = {
    account,
    existsBefore: before !== null,
    existsAfter: after !== null,
  };
  if (pre || post) {
    change.owner = { before: pre?.owner, after: post?.owner };
    change.amount = {
      before: BigInt(pre?.tokenAmount?.amount ?? "0"),
      after: BigInt(post?.tokenAmount?.amount ?? "0"),
    };
    change.delegate = { before: pre?.delegate, after: post?.delegate };
    change.delegatedAmount = {
      before: BigInt(pre?.delegatedAmount?.amount ?? "0"),
      after: BigInt(post?.delegatedAmount?.amount ?? "0"),
    };
  }
  return change;
}

// Asks the chain what this exact transaction would change, without sending it.
// Simulation shows effects; it is never treated as proof of what will settle.
export async function simulateEffects(
  rpc: Rpc<SimulateTransactionApi & GetMultipleAccountsApi>,
  wireTransaction: Base64EncodedWireTransaction,
  watch: string[],
): Promise<SimulatedEffects> {
  const addresses = [...new Set(watch)].slice(0, 20).map((value) => address(value));

  const before = await rpc.getMultipleAccounts(addresses, { encoding: "jsonParsed" }).send();

  const result = await rpc
    .simulateTransaction(wireTransaction, {
      encoding: "base64",
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
      accounts: { addresses, encoding: "jsonParsed" },
    })
    .send();

  const value = result.value;
  const error =
    value.err === null
      ? undefined
      : JSON.stringify(value.err, (_key, item) => (typeof item === "bigint" ? item.toString() : item));

  // A failed simulation returns no post-state, so there is nothing safe to compare.
  // The failure itself is the result, and policy treats it as a block.
  if (error !== undefined) {
    return { ok: false, error, logs: [...(value.logs ?? [])], unitsConsumed: value.unitsConsumed ?? undefined, changes: [] };
  }

  const after = (value.accounts ?? []) as ParsedAccount[];
  const changes = addresses.map((account, index) =>
    compare(account, (before.value[index] ?? null) as ParsedAccount, after[index] ?? null),
  );

  return {
    ok: true,
    logs: [...(value.logs ?? [])],
    unitsConsumed: value.unitsConsumed ?? undefined,
    changes,
  };
}
