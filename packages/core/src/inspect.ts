import {
  TokenInstruction,
  identifyTokenInstruction,
  parseApproveCheckedInstruction,
  parseApproveInstruction,
  parseCloseAccountInstruction,
  parseRevokeInstruction,
  parseSetAuthorityInstruction,
  parseTransferCheckedInstruction,
  parseTransferInstruction,
} from "@solana-program/token";
import { AccountRole, address, type Instruction } from "@solana/kit";
import type { DecodedInstruction, DecodedMessage } from "./decode.js";
import {
  COMPUTE_BUDGET_PROGRAM,
  LIGHTHOUSE_PROGRAM,
  MEMO_PROGRAM,
  isTokenProgram,
} from "./programs.js";
import type { InspectedInstruction, StaticEffects } from "./types.js";

function readU32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);
}

function readU64(data: Uint8Array, offset: number): bigint {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getBigUint64(offset, true);
}

// The token parsers expect kit's instruction shape.
function asKitInstruction(instruction: DecodedInstruction) {
  return {
    programAddress: address(instruction.programAddress),
    accounts: instruction.accounts.map((account) => ({
      address: address(account.address),
      role: account.role as AccountRole,
    })),
    data: instruction.data,
  } satisfies Instruction;
}

function shortAddress(value: string): string {
  return `${value.slice(0, 4)}..${value.slice(-4)}`;
}

// Reads every instruction in the message and records what it would do.
// Nothing here trusts what the server or client claims the transaction is.
export function inspectMessage(message: DecodedMessage): StaticEffects {
  const effects: StaticEffects = {
    feePayer: message.feePayer,
    instructions: [],
    transfers: [],
    approvals: [],
    authorityChanges: [],
    closes: [],
    unknownPrograms: [],
    memos: [],
  };

  message.instructions.forEach((instruction, index) => {
    const program = instruction.programAddress;
    const record = (kind: InspectedInstruction["kind"], summary: string) =>
      effects.instructions.push({ index, kind, program, summary });

    if (program === COMPUTE_BUDGET_PROGRAM) {
      const discriminator = instruction.data[0];
      if (discriminator === 2 && instruction.data.length >= 5) {
        effects.computeUnitLimit = readU32(instruction.data, 1);
        record("compute-unit-limit", `compute unit limit ${effects.computeUnitLimit}`);
      } else if (discriminator === 3 && instruction.data.length >= 9) {
        effects.computeUnitPriceMicroLamports = readU64(instruction.data, 1);
        record("compute-unit-price", `compute unit price ${effects.computeUnitPriceMicroLamports} microlamports`);
      } else {
        record("unknown", `compute budget instruction ${discriminator}`);
      }
      return;
    }

    if (program === MEMO_PROGRAM) {
      const memo = new TextDecoder().decode(instruction.data);
      effects.memos.push(memo);
      record("memo", `memo "${memo}"`);
      return;
    }

    if (program === LIGHTHOUSE_PROGRAM) {
      record("lighthouse", "lighthouse assertion");
      return;
    }

    if (isTokenProgram(program)) {
      const kit = asKitInstruction(instruction);
      let kind: TokenInstruction;
      try {
        kind = identifyTokenInstruction(kit);
      } catch {
        record("token-other", "unrecognised token instruction");
        return;
      }

      switch (kind) {
        case TokenInstruction.TransferChecked: {
          const parsed = parseTransferCheckedInstruction(kit);
          const transfer = {
            source: parsed.accounts.source.address,
            destination: parsed.accounts.destination.address,
            authority: parsed.accounts.authority.address,
            mint: parsed.accounts.mint.address,
            amount: parsed.data.amount,
            decimals: parsed.data.decimals,
          };
          effects.transfers.push(transfer);
          record("token-transfer", `transfer ${transfer.amount} to ${shortAddress(transfer.destination)}`);
          return;
        }
        case TokenInstruction.Transfer: {
          const parsed = parseTransferInstruction(kit);
          const transfer = {
            source: parsed.accounts.source.address,
            destination: parsed.accounts.destination.address,
            authority: parsed.accounts.authority.address,
            amount: parsed.data.amount,
          };
          effects.transfers.push(transfer);
          record("token-transfer", `unchecked transfer ${transfer.amount} to ${shortAddress(transfer.destination)}`);
          return;
        }
        case TokenInstruction.ApproveChecked: {
          const parsed = parseApproveCheckedInstruction(kit);
          const approval = {
            account: parsed.accounts.source.address,
            delegate: parsed.accounts.delegate.address,
            owner: parsed.accounts.owner.address,
            amount: parsed.data.amount,
          };
          effects.approvals.push(approval);
          record("token-approve", `approve ${approval.amount} to delegate ${shortAddress(approval.delegate)}`);
          return;
        }
        case TokenInstruction.Approve: {
          const parsed = parseApproveInstruction(kit);
          const approval = {
            account: parsed.accounts.source.address,
            delegate: parsed.accounts.delegate.address,
            owner: parsed.accounts.owner.address,
            amount: parsed.data.amount,
          };
          effects.approvals.push(approval);
          record("token-approve", `approve ${approval.amount} to delegate ${shortAddress(approval.delegate)}`);
          return;
        }
        case TokenInstruction.Revoke: {
          const parsed = parseRevokeInstruction(kit);
          record("token-revoke", `revoke delegate on ${shortAddress(parsed.accounts.source.address)}`);
          return;
        }
        case TokenInstruction.SetAuthority: {
          const parsed = parseSetAuthorityInstruction(kit);
          const newAuthority =
            parsed.data.newAuthority.__option === "Some" ? parsed.data.newAuthority.value : null;
          effects.authorityChanges.push({
            account: parsed.accounts.owned.address,
            currentAuthority: parsed.accounts.owner.address,
            authorityType: parsed.data.authorityType,
            newAuthority,
          });
          record("token-set-authority", `change authority of ${shortAddress(parsed.accounts.owned.address)} to ${newAuthority ? shortAddress(newAuthority) : "none"}`);
          return;
        }
        case TokenInstruction.CloseAccount: {
          const parsed = parseCloseAccountInstruction(kit);
          effects.closes.push({
            account: parsed.accounts.account.address,
            destination: parsed.accounts.destination.address,
            owner: parsed.accounts.owner.address,
          });
          record("token-close-account", `close ${shortAddress(parsed.accounts.account.address)}`);
          return;
        }
        default:
          record("token-other", `token instruction ${TokenInstruction[kind] ?? kind}`);
          return;
      }
    }

    if (!effects.unknownPrograms.includes(program)) {
      effects.unknownPrograms.push(program);
    }
    record("unknown", `unknown program ${program}`);
  });

  return effects;
}
