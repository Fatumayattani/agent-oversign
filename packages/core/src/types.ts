// What a transaction would do, in plain fields a policy can check.

export type InstructionKind =
  | "compute-unit-limit"
  | "compute-unit-price"
  | "token-transfer"
  | "token-approve"
  | "token-revoke"
  | "token-set-authority"
  | "token-close-account"
  | "token-other"
  | "memo"
  | "lighthouse"
  | "unknown";

export type InspectedInstruction = {
  index: number;
  kind: InstructionKind;
  program: string;
  summary: string;
};

export type TokenTransfer = {
  source: string;
  destination: string;
  authority: string;
  mint?: string;
  amount: bigint;
  decimals?: number;
};

export type TokenApproval = {
  account: string;
  delegate: string;
  owner: string;
  amount: bigint;
};

export type AuthorityChange = {
  account: string;
  currentAuthority: string;
  authorityType: number;
  newAuthority: string | null;
};

export type AccountClose = {
  account: string;
  destination: string;
  owner: string;
};

export type StaticEffects = {
  feePayer: string;
  instructions: InspectedInstruction[];
  transfers: TokenTransfer[];
  approvals: TokenApproval[];
  authorityChanges: AuthorityChange[];
  closes: AccountClose[];
  unknownPrograms: string[];
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: bigint;
  memos: string[];
};

export type WatchedAccountChange = {
  account: string;
  existsBefore: boolean;
  existsAfter: boolean;
  owner?: { before?: string; after?: string };
  amount?: { before: bigint; after: bigint };
  delegate?: { before?: string; after?: string };
  delegatedAmount?: { before: bigint; after: bigint };
};

export type SimulatedEffects = {
  ok: boolean;
  error?: string;
  logs: string[];
  unitsConsumed?: bigint;
  changes: WatchedAccountChange[];
};
