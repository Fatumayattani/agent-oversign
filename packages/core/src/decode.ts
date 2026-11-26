import {
  decompileTransactionMessageFetchingLookupTables,
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type GetMultipleAccountsApi,
  type Rpc,
} from "@solana/kit";

export type DecodedAccount = { address: string; role: number };

export type DecodedInstruction = {
  programAddress: string;
  accounts: DecodedAccount[];
  data: Uint8Array;
};

export type DecodedMessage = {
  feePayer: string;
  instructions: DecodedInstruction[];
};

// Turns a base64 wire transaction (what x402 puts in the payment payload) into the
// exact message bytes a signer would sign.
export function messageBytesFromWireTransaction(base64Transaction: string): Uint8Array {
  const bytes = getBase64Encoder().encode(base64Transaction);
  return new Uint8Array(getTransactionDecoder().decode(bytes).messageBytes);
}

// Decodes message bytes into instructions. Address lookup tables are resolved from
// the chain so no account can hide behind one.
export async function decodeMessage(
  messageBytes: Uint8Array,
  rpc: Rpc<GetMultipleAccountsApi>,
): Promise<DecodedMessage> {
  const compiled = getCompiledTransactionMessageDecoder().decode(messageBytes);
  const message = await decompileTransactionMessageFetchingLookupTables(compiled, rpc);

  // Lookup-table accounts are already resolved to full addresses at this point.
  const instructions = message.instructions as readonly {
    programAddress: string;
    accounts?: readonly { address: string; role: number }[];
    data?: ArrayLike<number>;
  }[];

  return {
    feePayer: message.feePayer.address,
    instructions: instructions.map((instruction) => ({
      programAddress: instruction.programAddress,
      accounts: (instruction.accounts ?? []).map((account) => ({
        address: account.address,
        role: account.role,
      })),
      data: new Uint8Array(instruction.data ?? []),
    })),
  };
}

// Accounts the transaction can modify. These are the ones simulation watches.
export function writableAccounts(message: DecodedMessage): string[] {
  const writable = new Set<string>();
  for (const instruction of message.instructions) {
    for (const account of instruction.accounts) {
      if (account.role & 1) writable.add(account.address);
    }
  }
  return [...writable];
}
