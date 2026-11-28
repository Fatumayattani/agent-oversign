"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { statusOf } from "@/lib/format";
import type { AgentState, Approval, Decision, Payment } from "@/lib/types";
import { ControlPanel } from "./ControlPanel";
import { Feed } from "./Feed";
import { Flow } from "./Flow";
import { Held } from "./Held";
import { SpendRail } from "./SpendRail";

const DAY_MS = 24 * 60 * 60 * 1000;
const HELD_FOR_MS = 60 * 60 * 1000;
const DECISION_COLUMNS =
  "id, created_at, agent, request_key, url, decision, reasons, payment, policy_hash, approved_by_owner, record_hash, attestor, anchor_transaction, settlement_transaction, inspection";

type Load = "loading" | "ready" | "not-owner" | "no-agent" | "error";

export function Dashboard({ session }: { session: Session }) {
  const [load, setLoad] = useState<Load>("loading");
  const [state, setState] = useState<AgentState | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Map<string, Approval>>(new Map());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const followingRef = useRef(true);
  const [now, setNow] = useState(() => Date.now());
  const email = session.user.email ?? "owner";
  const agentRef = useRef<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const loadPayments = useCallback(async (agent: string) => {
    const { data } = await supabase
      .from("payments")
      .select("id, timestamp_ms, payee, amount, request_key")
      .eq("agent", agent)
      .gte("timestamp_ms", Date.now() - DAY_MS);
    setPayments((data ?? []) as Payment[]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const { data: owner, error: ownerError } = await supabase.rpc("is_owner");
      if (cancelled) return;
      if (ownerError) return setLoad("error");
      if (owner !== true) return setLoad("not-owner");

      const [stateResult, decisionResult, approvalResult] = await Promise.all([
        supabase.from("agent_state").select("agent, frozen, updated_at, updated_by, policy").limit(1).maybeSingle(),
        supabase.from("decisions").select(DECISION_COLUMNS).order("created_at", { ascending: false }).limit(200),
        supabase.from("approvals").select("decision_id, approved_at, approved_by, used_at"),
      ]);
      if (cancelled) return;
      if (stateResult.error || decisionResult.error || approvalResult.error) return setLoad("error");
      if (!stateResult.data) return setLoad("no-agent");

      const agentState = stateResult.data as AgentState;
      agentRef.current = agentState.agent;
      setState(agentState);
      setDecisions((decisionResult.data ?? []) as Decision[]);
      setApprovals(new Map(((approvalResult.data ?? []) as Approval[]).map((item) => [item.decision_id, item])));
      await loadPayments(agentState.agent);
      if (!cancelled) setLoad("ready");
    }

    start();

    // Live updates. The database rules apply here too: only the owner receives rows.
    const channel = supabase
      .channel("oversign-owner")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "decisions" }, ({ new: row }) => {
        const decision = row as Decision;
        setDecisions((current) => (current.some((item) => item.id === decision.id) ? current : [decision, ...current]));
        setFresh((current) => new Set(current).add(decision.id));
        setNow(Date.now());
        if (followingRef.current) {
          setSelected(decision.id);
          setRunning(decision.id);
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "decisions" }, ({ new: row }) => {
        const decision = row as Decision;
        setDecisions((current) => current.map((item) => (item.id === decision.id ? { ...item, ...decision } : item)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "approvals" }, ({ new: row }) => {
        const approval = row as Approval;
        if (!approval?.decision_id) return;
        setApprovals((current) => new Map(current).set(approval.decision_id, approval));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_state" }, ({ new: row }) => {
        setState((current) => (current ? { ...current, ...(row as AgentState) } : current));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payments" }, () => {
        if (agentRef.current) loadPayments(agentRef.current);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [loadPayments]);

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

  async function freeze(frozen: boolean): Promise<string | null> {
    if (!state) return "No agent loaded.";
    const { data, error } = await supabase
      .from("agent_state")
      .update({ frozen, updated_at: new Date().toISOString(), updated_by: email })
      .eq("agent", state.agent)
      .select("agent, frozen, updated_at, updated_by, policy");
    if (error || !data?.length) return "The switch didn't change. Check that you are signed in as the owner.";
    setState(data[0] as AgentState);
    return null;
  }

  async function approve(id: string): Promise<string | null> {
    const { error } = await supabase.from("approvals").insert({ decision_id: id });
    if (error) return "That payment can't be approved. Only held payments can be, and only once.";
    setApprovals((current) =>
      new Map(current).set(id, { decision_id: id, approved_at: new Date().toISOString(), approved_by: email, used_at: null }),
    );
    return null;
  }

  return (
    <div className="shell">
      <header className="masthead">
        <span className="wordmark">Oversign</span>
        <span className={`live ${live ? "live-on" : ""}`}>{live ? "Live" : "Connecting"}</span>
        <span className="masthead-gap" />
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
