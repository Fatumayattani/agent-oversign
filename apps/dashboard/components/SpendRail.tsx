import { short, toUsd, usd } from "@/lib/format";
import type { Payment, PolicySummary } from "@/lib/types";

// Spending over the last 24 hours, the same rolling window the signer counts.
// Each signed payment is one segment of the daily budget.
export function SpendRail({ payments, policy }: { payments: Payment[]; policy: PolicySummary }) {
  const ordered = [...payments].sort((a, b) => a.timestamp_ms - b.timestamp_ms);
  const total = ordered.reduce((sum, payment) => sum + toUsd(payment.amount), 0);
  const budget = policy.dailyBudget;
  const left = Math.max(0, budget - total);
  const names = new Map(policy.payees.map((payee) => [payee.address, payee.name]));

  const perPayee = new Map<string, number>();
  for (const payment of ordered) {
    perPayee.set(payment.payee, (perPayee.get(payment.payee) ?? 0) + toUsd(payment.amount));
  }

  const minutes = Math.round(policy.duplicateWindowSeconds / 60);

  return (
    <section className="spend" aria-labelledby="spend-title">
      <div className="spend-head">
        <h2 id="spend-title" className="section-title">
          {usd(total)} spent in the last 24 hours
        </h2>
        <p className="spend-left">{usd(left)} left of {usd(budget)}</p>
      </div>

      <div
        className="rail"
        role="img"
        aria-label={`${ordered.length} payments totalling ${usd(total)} of a ${usd(budget)} daily budget`}
      >
        {ordered.map((payment) => {
          const width = Math.min(100, (toUsd(payment.amount) / budget) * 100);
          const known = names.has(payment.payee);
          return (
            <span
              key={payment.id}
              className={`rail-segment ${known ? "" : "rail-segment-unknown"}`}
              style={{ width: `max(${width}%, 3px)` }}
              title={`${usd(toUsd(payment.amount))} to ${names.get(payment.payee) ?? short(payment.payee)}`}
            />
          );
        })}
      </div>

      {perPayee.size > 0 && (
        <ul className="payees">
          {[...perPayee.entries()].map(([payee, spent]) => {
            const share = Math.min(100, (spent / policy.perPayeeDaily) * 100);
            return (
              <li key={payee}>
                <span className="payee-name">{names.get(payee) ?? <span className="mono">{short(payee)}</span>}</span>
                <span className="payee-bar" aria-hidden="true">
                  <span style={{ width: `${share}%` }} />
                </span>
                <span className="payee-amount">
                  {usd(spent)} <span className="quiet">of {usd(policy.perPayeeDaily)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rules">
        <h3 className="rules-title">Rules in force</h3>
        <ul>
          <li>No single payment above {usd(policy.maxPerPayment)}.</li>
          <li>No more than {usd(policy.perPayeeDaily)} a day to any one payee.</li>
          <li>
            {policy.unknownPayees === "review" ? "Payees not on the list are held for you." : "Payees not on the list are blocked."}
          </li>
          <li>Paying twice for the same request within {minutes} minutes is held for you.</li>
          <li>Anything that is not a single plain {policy.asset} transfer from the agent is blocked.</li>
        </ul>
        <p className="quiet small">
          Policy fingerprint <span className="mono">{short(policy.hash, 8, 8)}</span>, recorded in every decision.
        </p>
      </div>
    </section>
  );
}
