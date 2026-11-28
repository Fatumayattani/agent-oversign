"use client";

import { useState } from "react";
import { ago, explorerAddress, short } from "@/lib/format";
import type { AgentState } from "@/lib/types";
import { Seal } from "./Seal";

type Props = {
  state: AgentState;
  now: number;
  onFreeze: (frozen: boolean) => Promise<string | null>;
};

// The kill switch. Freezing is one click, because it is always the safe direction.
// Resuming asks once more, because it lets the agent spend again.
export function ControlPanel({ state, now, onFreeze }: Props) {
  const [confirmResume, setConfirmResume] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = state.policy?.name ?? "your agent";

  async function flip(frozen: boolean) {
    setBusy(true);
    setError(null);
    const failure = await onFreeze(frozen);
    if (failure) setError(failure);
    setConfirmResume(false);
    setBusy(false);
  }

  return (
    <section className={`control ${state.frozen ? "control-frozen" : ""}`} aria-labelledby="control-title">
      <Seal frozen={state.frozen} size={150} />
      <div className="control-body">
        <h1 id="control-title" className="control-title">
          {state.frozen ? `${name} is frozen.` : `Signing for ${name}.`}
        </h1>
        <p className="control-lede">
          {state.frozen
            ? "Every payment is refused at the signer until you resume. Nothing can be signed, whatever the agent asks for."
            : "Each payment the agent asks for is checked against your rules before its key signs anything."}
        </p>
        <p className="control-meta">
          Wallet{" "}
          <a href={explorerAddress(state.agent)} target="_blank" rel="noreferrer" className="mono">
            {short(state.agent, 6, 6)}
          </a>
          {state.updated_by && (
            <>
              <span className="meta-gap" />
              {state.frozen ? "Frozen" : "Last changed"} by {state.updated_by} {ago(state.updated_at, now)}
            </>
          )}
        </p>

        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <div className="control-actions">
        {!state.frozen && (
          <button className="button button-seal" disabled={busy} onClick={() => flip(true)}>
            Freeze agent
          </button>
        )}
        {state.frozen && !confirmResume && (
          <button className="button button-ink" disabled={busy} onClick={() => setConfirmResume(true)}>
            Resume signing
          </button>
        )}
        {state.frozen && confirmResume && (
          <>
            <button className="button button-ink" disabled={busy} onClick={() => flip(false)}>
              Yes, let it pay again
            </button>
            <button className="button button-quiet" disabled={busy} onClick={() => setConfirmResume(false)}>
              Keep frozen
            </button>
          </>
        )}
      </div>
    </section>
  );
}
