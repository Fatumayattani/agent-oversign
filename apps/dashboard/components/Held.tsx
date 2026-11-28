"use client";

import { useState } from "react";
import { ago, requestLabel, short, toUsd, usd } from "@/lib/format";
import type { Decision } from "@/lib/types";

type Props = {
  held: Decision[];
  now: number;
  names: Map<string, string>;
  onApprove: (id: string) => Promise<string | null>;
};

// Payments the signer refused to sign without you. Approving one lets exactly that
// payment through on the agent's next try. A blocked payment never shows up here.
export function Held({ held, now, names, onApprove }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (held.length === 0) return null;

  async function approve(id: string) {
    setBusy(id);
    setError(null);
    const failure = await onApprove(id);
    if (failure) setError(failure);
    setBusy(null);
  }

  return (
    <section className="held" aria-labelledby="held-title">
      <h2 id="held-title" className="section-title">
        {held.length === 1 ? "One payment is waiting for you" : `${held.length} payments are waiting for you`}
      </h2>
      <ul className="slips">
        {held.map((decision) => {
          const request = requestLabel(decision.url);
          const payee = decision.payment?.payee ?? "";
          return (
            <li key={decision.id} className="slip">
              <div className="slip-amount">{usd(toUsd(decision.payment?.amount))}</div>
              <div className="slip-body">
                <p className="slip-what">
                  To <strong>{names.get(payee) ?? <span className="mono">{short(payee, 6, 6)}</span>}</strong> for{" "}
                  <span className="mono">{request.path}</span>
                </p>
                <ul className="slip-reasons">
                  {decision.reasons.map((reason) => (
                    <li key={reason.code}>{reason.message}</li>
                  ))}
                </ul>
                <p className="quiet small">Asked {ago(decision.created_at, now)}. An approval covers one retry within 10 minutes.</p>
              </div>
              <button className="button button-ink" disabled={busy === decision.id} onClick={() => approve(decision.id)}>
                {busy === decision.id ? "Approving" : "Approve this payment"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}
