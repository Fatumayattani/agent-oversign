"use client";

import { useState, type ReactNode } from "react";
import { ago, explorerTx, requestLabel, short, statusOf, toUsd, usd, type Status } from "@/lib/format";
import { DANGEROUS_KINDS, checkRules, programName } from "@/lib/rules";
import type { ApprovalProof } from "@/lib/approval";
import type { Approval, Decision, Evidence, PolicySummary, Reason } from "@/lib/types";
import { ApproveButton } from "./ApproveButton";

type StationState = "done" | "hold" | "stop" | "idle";

type Props = {
  decision: Decision;
  approval: Approval | undefined;
  policy: PolicySummary | null;
  names: Map<string, string>;
  now: number;
  run: boolean;
  onApprove: (id: string, proof: ApprovalProof) => Promise<string | null>;
};

// One payment: the outcome first, a strip showing where it got to, then each step
// with what Oversign actually saw.
export function Flow({ decision, approval, policy, names, now, run, onApprove }: Props) {
  const evidence = decision.inspection;
  const status = statusOf(decision, approval, now);
  const signed = decision.decision === "ALLOW" || decision.approved_by_owner;
  const waiting = status.kind === "held" || status.kind === "waiting";
  const request = requestLabel(decision.url);
  const agentName = policy?.name ?? "The agent";
  const payeeName = (address?: string) => (address ? names.get(address) ?? short(address, 4, 4) : "unknown");
  const verdictState: StationState =
    decision.decision === "BLOCK" ? "stop" : decision.decision === "REVIEW" && !signed ? "hold" : "done";
  const states: StationState[] = [
    "done",
    decision.payment ? "done" : "stop",
    evidence ? readState(evidence) : "idle",
    evidence ? simulationState(evidence) : "idle",
    verdictState,
    ownerState(status),
    signed ? "done" : waiting ? "hold" : "stop",
    decision.anchor_transaction ? "done" : "idle",
  ];
  const summary = summarise(decision, status, payeeName(decision.payment?.payee));

  return (
    <section className={`flow ${run ? "flow-run" : ""}`} aria-labelledby="flow-title" key={decision.id}>
      <div className={`outcome outcome-${summary.tone}`}>
        <p className="outcome-when quiet small">
          {ago(decision.created_at, now)}, for <span className="mono">{request.path}</span>
        </p>
        <h2 id="flow-title" className="outcome-title">
          {summary.title}
        </h2>
        <p className="outcome-why">{summary.why}</p>
      </div>

      <ol className="stepper" aria-label="Where this payment went">
        {STEPS.map((label, index) => (
          <li key={label} className={`step step-${states[index]}`} style={{ "--i": index } as React.CSSProperties}>
            <span className="step-dot" aria-hidden="true" />
            <span className="step-label">{stepLabel(label, states[index]!)}</span>
          </li>
        ))}
      </ol>

      <h3 className="route-title">Step by step</h3>

      <ol className="route">
        <Station index={0} state="done" title={`${agentName} asked to buy something`}>
          <p>
            <span className="mono">{request.host}</span>
            <span className="mono strong">{request.path}</span>
          </p>
          <p className="quiet">It sent Oversign a token. The key that pays never leaves Oversign.</p>
        </Station>

        <Station
          index={1}
          state={states[1]}
          title={decision.payment ? `The seller asked for ${usd(toUsd(decision.payment.amount))}` : "No payment could be read"}
        >
          {decision.payment ? (
            <p>
              Payable in USDC to <strong>{payeeName(decision.payment.payee)}</strong>, from its HTTP 402 reply. Oversign
              checks the transaction itself rather than trusting the reply.
            </p>
          ) : (
            <p>The transaction did not contain exactly one payment Oversign could read.</p>
          )}
        </Station>

        <Station index={2} state={states[2]} title="Oversign read the transaction" timing={evidence?.timings.decodeMs}>
          {evidence ? <Instructions evidence={evidence} names={names} /> : <NoEvidence />}
        </Station>

        <Station
          index={3}
          state={states[3]}
          title="Solana did a dry run"
          timing={evidence?.timings.simulateMs}
        >
          {evidence ? <Simulation evidence={evidence} agent={decision.agent} names={names} /> : <NoEvidence />}
        </Station>

        <Station index={4} state={states[4]} title="Your rules" timing={evidence?.timings.evaluateMs}>
          <Rules decision={decision} />
        </Station>

        <Station index={5} state={states[5]} title={ownerTitle(status)}>
          <Owner decision={decision} status={status} onApprove={onApprove} />
        </Station>

        <Station
          index={6}
          state={states[6]}
          title={signed ? "The key signed" : waiting ? "The key is waiting for you" : "The key never signed"}
        >
          {signed ? (
            decision.settlement_transaction ? (
              <p>
                Paid and settled on Solana.{" "}
                <a href={explorerTx(decision.settlement_transaction)} target="_blank" rel="noreferrer">
                  See the payment
                </a>
              </p>
            ) : (
              <p>Signed and handed to the seller to settle.</p>
            )
          ) : (
            <p>
              {waiting
                ? "Nothing is signed while this waits. After you approve, the agent's next try is signed once."
                : "No signature exists, so no money moved. The agent can ask again, but it cannot pay without Oversign."}
            </p>
          )}
        </Station>

        <Station index={7} state={states[7]} title="A record anyone can check" last>
          <p>
            Decision record <span className="mono">{short(decision.record_hash, 10, 6)}</span>, signed by Oversign&apos;s
            attestor and tied to policy <span className="mono">{short(decision.policy_hash, 6, 4)}</span>.
          </p>
          <p>
            {decision.anchor_transaction ? (
              <a href={explorerTx(decision.anchor_transaction)} target="_blank" rel="noreferrer">
                See its fingerprint written on Solana
              </a>
            ) : (
              <span className="quiet">Writing its fingerprint to Solana.</span>
            )}
          </p>
        </Station>
      </ol>
    </section>
  );
}

function Station({
  index,
  state,
  title,
  timing,
  last = false,
  children,
}: {
  index: number;
  state: StationState;
  title: string;
  timing?: number;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`station station-${state} ${last ? "station-last" : ""}`} style={{ "--i": index } as React.CSSProperties}>
      <span className="station-node" aria-hidden="true" />
      <div className="station-body">
        <h3 className="station-title">
          {title}
          {timing !== undefined && <span className="station-time">{timing} ms</span>}
        </h3>
        <div className="station-content">{children}</div>
      </div>
    </li>
  );
}

function NoEvidence() {
  return <p className="quiet">This decision was made before Oversign kept its working.</p>;
}

function readState(evidence: Evidence): StationState {
  return evidence.instructions.some((item) => DANGEROUS_KINDS.has(item.kind) || !programName(item.program)) ? "stop" : "done";
}

function simulationState(evidence: Evidence): StationState {
  const simulation = evidence.simulation;
  if (!simulation || !simulation.ok) return "stop";
  return simulation.changes.some((change) => change.ownerChanged || change.delegateChanged || change.closed) ? "stop" : "done";
}

function instructionText(item: Evidence["instructions"][number], evidence: Evidence, names: Map<string, string>): string {
  switch (item.kind) {
    case "compute-unit-limit":
      return `Set a compute limit of ${evidence.computeUnitLimit?.toLocaleString() ?? "?"} units`;
    case "compute-unit-price": {
      const price = evidence.computeUnitPrice ?? "?";
      return `Offer a priority fee of ${price} ${price === "1" ? "microlamport" : "microlamports"} per unit`;
    }
    case "token-transfer": {
      const transfer = evidence.transfers[0];
      if (!transfer) return item.summary;
      // The destination is a token account. Name it by the wallet Solana says owns it.
      const owner = evidence.simulation?.changes.find((change) => change.account === transfer.destination)?.owner;
      const to = (owner && names.get(owner)) ?? (owner ? short(owner) : short(transfer.destination));
      return `Send ${usd(toUsd(transfer.amount))} USDC from the agent to ${to}`;
    }
    default:
      return item.summary.charAt(0).toUpperCase() + item.summary.slice(1);
  }
}

function Instructions({ evidence, names }: { evidence: Evidence; names: Map<string, string> }) {
  return (
    <ol className="instructions">
      {evidence.instructions.map((item) => {
        const program = programName(item.program);
        const danger = DANGEROUS_KINDS.has(item.kind) || !program;
        return (
          <li key={item.index} className={danger ? "instruction-danger" : ""}>
            <span className="instruction-program">{program ?? short(item.program)}</span>
            <span>{instructionText(item, evidence, names)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Simulation({ evidence, agent, names }: { evidence: Evidence; agent: string; names: Map<string, string> }) {
  const simulation = evidence.simulation;
  if (!simulation) return <p>No simulation was run, so the effects could not be confirmed.</p>;
  if (!simulation.ok) return <p>The simulation failed: {simulation.error ?? "no reason given"}.</p>;

  const moves = simulation.changes.filter((change) => change.before !== undefined && change.after !== undefined && change.before !== change.after);
  const flags = simulation.changes.filter((change) => change.ownerChanged || change.delegateChanged || change.closed);
  const who = (owner?: string) => (owner === agent ? "The agent" : owner ? names.get(owner) ?? short(owner) : "An account");

  return (
    <>
      <p className="quiet">If it were signed, this is what would happen:</p>
      <ul className="moves">
        {moves.map((change) => {
          const delta = toUsd(change.after) - toUsd(change.before);
          return (
            <li key={change.account}>
              <span className="move-who">{who(change.owner)}</span>
              <span className="move-balances">
                {toUsd(change.before).toFixed(2)} → {toUsd(change.after).toFixed(2)} USDC
              </span>
              <span className={`move-delta ${delta < 0 ? "move-out" : "move-in"}`}>
                {delta < 0 ? "−" : "+"}
                {Math.abs(delta).toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
      {flags.length === 0 ? (
        <p className="quiet">No account changes hands, gains a spender or gets closed.</p>
      ) : (
        <ul className="flags">
          {flags.map((change) => (
            <li key={change.account}>
              {short(change.account)}{" "}
              {change.ownerChanged ? "would change owner." : change.delegateChanged ? "would gain a spender." : "would be closed."}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Rules({ decision }: { decision: Decision }) {
  const [showAll, setShowAll] = useState(false);
  const results = checkRules(decision.reasons, decision.payment !== null);
  const failed = results.filter((result) => result.outcome === "hold" || result.outcome === "block");
  const passed = results.filter((result) => result.outcome === "pass").length;
  const shown = showAll ? results : failed;

  return (
    <>
      {failed.length === 0 && !showAll && <p>All {passed} rules passed.</p>}
      {shown.length > 0 && (
        <ul className="checks">
          {shown.map(({ rule, outcome, reasons }) => (
            <li key={rule.label} className={`check check-${outcome}`}>
              <span className="check-mark" aria-hidden="true">
                {outcome === "pass" ? "✓" : outcome === "skipped" ? "–" : outcome === "hold" ? "!" : "×"}
              </span>
              <span>
                {rule.label}
                <span className="visually-hidden">
                  {outcome === "pass" ? ": passed" : outcome === "skipped" ? ": not checked" : outcome === "hold" ? ": held" : ": blocked"}
                </span>
                {reasons.map((reason) => (
                  <span key={reason.code} className="check-why">
                    {plainReason(reason)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
      <button className="button button-quiet small rules-toggle" onClick={() => setShowAll(!showAll)}>
        {showAll ? "Show only the rules that failed" : failed.length > 0 ? `Show all ${results.length} rules (${passed} passed)` : "Show the rules"}
      </button>
    </>
  );
}

const STEPS = ["Asked", "Priced", "Read", "Dry run", "Rules", "You", "Signed", "Recorded"];

function stepLabel(label: string, state: StationState): string {
  if (label === "Signed" && state === "stop") return "Not signed";
  if (label === "Signed" && state === "hold") return "Waiting";
  if (label === "You" && state === "hold") return "Needs you";
  if (label === "You" && state === "idle") return "Not needed";
  if (label === "Rules" && state === "stop") return "Blocked";
  if (label === "Rules" && state === "hold") return "Held";
  return label;
}

// Reason messages in the owner's words. The service's wording stays in the record.
function plainReason(reason: Reason): string {
  if (reason.code === "AGENT_FROZEN") return "You had frozen the agent when this was asked for.";
  if (reason.code === "DUPLICATE_REQUEST") {
    const seconds = reason.message.match(/(\d+)s ago/)?.[1];
    return `The agent already paid for this exact request${seconds ? ` ${seconds} seconds ago` : " a moment ago"}.`;
  }
  return reason.message;
}

type Summary = { tone: "allowed" | "held" | "blocked"; title: string; why: string };

// The answer first: what happened to the money, and the main reason.
function summarise(decision: Decision, status: Status, payee: string): Summary {
  const amount = decision.payment ? usd(toUsd(decision.payment.amount)) : "A payment";
  const blockers = decision.reasons.filter((reason) => reason.decision === "BLOCK");
  const holds = decision.reasons.filter((reason) => reason.decision === "REVIEW");

  switch (status.kind) {
    case "allowed":
      return { tone: "allowed", title: `Paid ${amount} to ${payee}.`, why: "Every rule passed, so Oversign signed it." };
    case "approved":
      return { tone: "allowed", title: `Paid ${amount} to ${payee} after you approved it.`, why: "Oversign held it first, then signed it once on your say-so." };
    case "released":
      return { tone: "allowed", title: `You approved ${amount} to ${payee}, and it was paid.`, why: holds[0] ? `Held first because: ${plainReason(holds[0])}` : "Oversign held it first." };
    case "blocked":
      return {
        tone: "blocked",
        title: `Blocked ${amount} to ${payee}. No money moved.`,
        why: blockers.length > 0 ? plainReason(blockers[0]!) : "It broke a hard rule.",
      };
    case "held":
      return {
        tone: "held",
        title: `Holding ${amount} to ${payee} for you.`,
        why: `${holds[0] ? plainReason(holds[0]) : "It needs your approval."} Nothing is paid unless you approve it.`,
      };
    case "waiting":
      return { tone: "held", title: `You approved ${amount} to ${payee}.`, why: "It will be signed when the agent tries again, within 10 minutes." };
    case "expired":
      return { tone: "held", title: `${amount} to ${payee} was never paid.`, why: "You approved it, but the agent didn't try again within 10 minutes." };
  }
}

function ownerState(status: Status): StationState {
  if (status.kind === "held" || status.kind === "waiting") return "hold";
  if (status.kind === "approved" || status.kind === "released") return "done";
  return "idle";
}

function ownerTitle(status: Status): string {
  switch (status.kind) {
    case "held":
      return "Waiting for you";
    case "waiting":
      return "You approved it";
    case "released":
      return "You approved it, and it was paid";
    case "approved":
      return "You approved it";
    case "expired":
      return "Your approval expired";
    case "blocked":
      return "Not yours to approve";
    default:
      return "You weren't needed";
  }
}

function Owner({
  decision,
  status,
  onApprove,
}: {
  decision: Decision;
  status: Status;
  onApprove: (id: string, proof: ApprovalProof) => Promise<string | null>;
}) {
  switch (status.kind) {
    case "allowed":
      return <p>Every rule passed, so Oversign signed without asking you.</p>;
    case "blocked":
      return <p>A blocked payment breaks a hard rule. No one can approve it, not even you.</p>;
    case "approved":
      return <p>This is the agent&apos;s retry after your approval, so it was signed once.</p>;
    case "released":
      return <p>Your approval was used by the agent&apos;s next try, which was signed.</p>;
    case "waiting":
      return <p>The agent&apos;s next try of this exact payment will be signed. The approval lapses after 10 minutes.</p>;
    case "expired":
      return <p>The agent didn&apos;t retry within 10 minutes, so the approval lapsed unused.</p>;
    case "held":
      return (
        <>
          <p>Nothing is signed until you decide. Your wallet signs the approval, and it covers this one payment only.</p>
          <ApproveButton decision={decision} onApprove={onApprove} />
        </>
      );
  }
}
