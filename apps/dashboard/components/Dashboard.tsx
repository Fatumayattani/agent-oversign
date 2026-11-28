"use client";

import { useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { statusOf } from "@/lib/format";
import { useOwnerData } from "@/lib/useOwnerData";
import { ControlPanel } from "./ControlPanel";
import { Feed } from "./Feed";
import { Flow } from "./Flow";
import { Held } from "./Held";
import { SpendRail } from "./SpendRail";

const HELD_FOR_MS = 60 * 60 * 1000;

export function Dashboard({ session }: { session: Session }) {
  const email = session.user.email ?? "owner";
  const [selected, setSelected] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const followingRef = useRef(true);

  const { load, state, decisions, approvals, payments, fresh, live, now, freeze, approve } = useOwnerData(
    email,
    (decision) => {
      if (followingRef.current) {
        setSelected(decision.id);
        setRunning(decision.id);
      }
    },
  );

  const names = useMemo(
    () => new Map((state?.policy?.payees ?? []).map((payee) => [payee.address, payee.name])),
    [state?.policy],
  );

  const current = decisions.find((decision) => decision.id === selected) ?? decisions[0];

  function select(id: string) {
    followingRef.current = false;
    setFollowing(false);
    setRunning(null);
    setSelected(id);
  }

  function follow() {
    followingRef.current = true;
    setFollowing(true);
    setSelected(decisions[0]?.id ?? null);
  }

  const held = useMemo(
    () =>
      decisions.filter(
        (decision) =>
          statusOf(decision, approvals.get(decision.id), now).kind === "held" &&
          decision.payment !== null &&
          now - new Date(decision.created_at).getTime() < HELD_FOR_MS,
      ),
    [decisions, approvals, now],
  );

  return (
    <div className="shell">
      <header className="masthead">
        <span className="wordmark">Oversign</span>
        <span className={`live ${live ? "live-on" : ""}`}>{live ? "Live" : "Connecting"}</span>
        <span className="masthead-gap" />
        <a className="masthead-link" href="/approve">
          Phone approvals
        </a>
        <span className="who">{email}</span>
        <button className="button button-quiet" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      {load === "loading" && <p className="notice">Loading your agent.</p>}
      {load === "error" && (
        <p className="notice">Supabase didn&apos;t answer. Check your connection and the project URL, then reload.</p>
      )}
      {load === "not-owner" && (
        <p className="notice">{email} isn&apos;t an owner of this agent. Sign in with the owner account.</p>
      )}
      {load === "no-agent" && (
        <p className="notice">No agent yet. Start the Oversign service once and it will appear here.</p>
      )}

      {load === "ready" && state && (
        <main className="desk">
          <ControlPanel state={state} now={now} onFreeze={freeze} />
          <Held held={held} now={now} names={names} onApprove={approve} />
          <div className="columns">
            {current ? (
              <Flow
                decision={current}
                approval={approvals.get(current.id)}
                policy={state.policy}
                names={names}
                now={now}
                run={running === current.id}
                onApprove={approve}
              />
            ) : (
              <section className="flow flow-empty">
                <h2 className="section-title">Waiting for the first payment</h2>
                <p className="quiet">
                  When the agent asks Oversign to pay, you&apos;ll see the payment travel from the request, through the
                  transaction check and your rules, to the signature and the proof on Solana.
                </p>
              </section>
            )}
            <aside className="aside">
              <Feed
                decisions={decisions}
                approvals={approvals}
                fresh={fresh}
                names={names}
                now={now}
                selected={current?.id ?? null}
                following={following}
                onSelect={select}
                onFollow={follow}
              />
              {state.policy && <SpendRail payments={payments} policy={state.policy} />}
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
