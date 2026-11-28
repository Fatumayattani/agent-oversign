"use client";

import { useState } from "react";
import { ago, requestLabel, short, statusOf, toUsd, usd } from "@/lib/format";
import type { Approval, Decision, Verdict } from "@/lib/types";
import { Stamp } from "./Stamp";

type Filter = "ALL" | Verdict;

const filters: { value: Filter; label: string }[] = [
  { value: "ALL", label: "Everything" },
  { value: "ALLOW", label: "Allowed" },
  { value: "REVIEW", label: "Held" },
  { value: "BLOCK", label: "Blocked" },
];

type Props = {
  decisions: Decision[];
  approvals: Map<string, Approval>;
  fresh: Set<string>;
  names: Map<string, string>;
  now: number;
  selected: string | null;
  following: boolean;
  onSelect: (id: string) => void;
  onFollow: () => void;
};

// Every decision, newest first. Picking one shows its whole journey in the flow.
export function Feed({ decisions, approvals, fresh, names, now, selected, following, onSelect, onFollow }: Props) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const shown = filter === "ALL" ? decisions : decisions.filter((decision) => decision.decision === filter);

  return (
    <section className="feed" aria-labelledby="feed-title">
      <div className="feed-head">
        <h2 id="feed-title" className="section-title">
          Every decision
        </h2>
        {following ? (
          <span className="quiet small">Showing each new one as it arrives</span>
        ) : (
          <button className="button button-quiet small" onClick={onFollow}>
            Follow new decisions
          </button>
        )}
      </div>
      <div className="filters" role="group" aria-label="Show decisions">
        {filters.map((item) => (
          <button
            key={item.value}
            className={`filter ${filter === item.value ? "filter-on" : ""}`}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="empty">
          {decisions.length === 0
            ? "No payments yet. When the agent asks Oversign to pay, each decision lands here the moment it is made."
            : "Nothing in this view yet."}
        </p>
      )}

      <ol className="ledger">
        {shown.map((decision) => {
          const status = statusOf(decision, approvals.get(decision.id), now);
          const request = requestLabel(decision.url);
          const payee = decision.payment?.payee;
          const isSelected = selected === decision.id;
          return (
            <li
              key={decision.id}
              className={`entry entry-${status.kind} ${fresh.has(decision.id) ? "entry-fresh" : ""} ${isSelected ? "entry-selected" : ""}`}
            >
              <button className="entry-row" aria-current={isSelected} onClick={() => onSelect(decision.id)}>
                <span className="entry-top">
                  <Stamp status={status} fresh={fresh.has(decision.id)} />
                  <span className="entry-amount">{decision.payment ? usd(toUsd(decision.payment.amount)) : ""}</span>
                </span>
                <span className="entry-path mono">{request.path}</span>
                <span className="entry-who">
                  {payee ? `to ${names.get(payee) ?? short(payee)}` : "no payment found"}
                  <span className="entry-time">{ago(decision.created_at, now)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
