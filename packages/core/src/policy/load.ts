import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import { PolicySchema, type Policy } from "./schema.js";

export type LoadedPolicy = {
  policy: Policy;
  // Fingerprint of the exact policy text. Each decision records it, so anyone can
  // check which rules were in force when a payment was allowed or blocked.
  hash: string;
  source: string;
};

export function parsePolicy(text: string, source = "inline"): LoadedPolicy {
  const result = PolicySchema.safeParse(parse(text));
  if (!result.success) {
    throw new Error(`Invalid policy in ${source}:\n${z.prettifyError(result.error)}`);
  }
  const hash = createHash("sha256").update(text).digest("hex");
  return { policy: result.data, hash, source };
}

export function loadPolicy(path: string): LoadedPolicy {
  return parsePolicy(readFileSync(path, "utf8"), path);
}
