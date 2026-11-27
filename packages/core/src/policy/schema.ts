import { z } from "zod";

// The policy file format. Every rule is explicit and readable, so anyone can review
// exactly what an agent is allowed to pay for.
const usd = z.number().nonnegative();

export const PolicySchema = z.object({
  version: z.literal(1),
  agent: z.string().min(1),
  asset: z.object({
    symbol: z.string().min(1),
    mint: z.string().min(32),
    decimals: z.number().int().min(0).max(18),
  }),
  limits: z.object({
    max_per_payment_usd: usd,
    daily_budget_usd: usd,
    per_payee_daily_usd: usd,
  }),
  payees: z.object({
    allowed: z
      .array(
        z.object({
          name: z.string().min(1),
          address: z.string().min(32),
          usual_price_usd: usd,
        }),
      )
      .default([]),
    unknown: z.enum(["review", "block"]).default("review"),
  }),
  transactions: z.object({
    allowed_programs: z.array(z.string().min(32)).min(1),
    allow_approvals: z.boolean().default(false),
    allow_authority_changes: z.boolean().default(false),
    allow_account_closes: z.boolean().default(false),
    max_compute_unit_price_microlamports: z.number().int().nonnegative(),
    require_simulation: z.boolean().default(true),
  }),
  duplicates: z.object({
    window_seconds: z.number().int().nonnegative(),
  }),
});

export type Policy = z.infer<typeof PolicySchema>;
