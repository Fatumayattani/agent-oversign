import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";

// Creates the two Oversign tokens in .env if they are not there yet.
// The agent token lets an agent ask for payments. The owner token unlocks approvals
// and the kill switch. Neither one is a key.
const ENV_FILE = ".env";
const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
const lines: string[] = [];

for (const name of ["OVERSIGN_AGENT_TOKEN", "OVERSIGN_OWNER_TOKEN"]) {
  if (new RegExp(`^${name}=.+`, "m").test(existing)) {
    console.log(`${name} already set`);
    continue;
  }
  lines.push(`${name}=${randomBytes(24).toString("hex")}`);
  console.log(`${name} created`);
}

if (lines.length > 0) {
  appendFileSync(ENV_FILE, `\nOVERSIGN_PORT=4030\n${lines.join("\n")}\n`);
}
