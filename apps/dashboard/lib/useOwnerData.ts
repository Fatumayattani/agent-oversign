"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ApprovalProof } from "./approval";
import { supabase } from "./supabase";
import type { AgentState, Approval, Decision, Payment } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const DECISION_COLUMNS =
  "id, created_at, agent, request_key, url, decision, reasons, payment, policy_hash, approved_by_owner, record_hash, attestor, anchor_transaction, settlement_transaction, inspection";

export type Load = "loading" | "ready" | "not-owner" | "no-agent" | "error";

// Everything the owner sees, loaded once and kept live. Shared by the dashboard and
// the phone page. The database rules decide what a signed-in owner can read or change.
export function useOwnerData(email: string, onNewDecision?: (decision: Decision) => void) {
  const [load, setLoad] = useState<Load>("loading");
  const [state, setState] = useState<AgentState | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [approvals, setApprovals] = useState<Map<string, Approval>>(new Map());
  const [payments, setPayments] = useState<Payment[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const agentRef = useRef<string | null>(null);
  const onNewRef = useRef(onNewDecision);
  onNewRef.current = onNewDecision;

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

    const channel = supabase
      .channel("oversign-owner")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "decisions" }, ({ new: row }) => {
        const decision = row as Decision;
        setDecisions((current) => (current.some((item) => item.id === decision.id) ? current : [decision, ...current]));
        setFresh((current) => new Set(current).add(decision.id));
        setNow(Date.now());
        onNewRef.current?.(decision);
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

  const freeze = useCallback(
    async (frozen: boolean): Promise<string | null> => {
      if (!state) return "No agent loaded.";
      const { data, error } = await supabase
        .from("agent_state")
        .update({ frozen, updated_at: new Date().toISOString(), updated_by: email })
        .eq("agent", state.agent)
        .select("agent, frozen, updated_at, updated_by, policy");
      if (error || !data?.length) return "The switch didn't change. Check that you are signed in as the owner.";
      setState(data[0] as AgentState);
      return null;
    },
    [state, email],
  );

  // The wallet's signature goes with the approval. Oversign checks it is from the
  // owner's wallet and names this exact payment before signing anything.
  const approve = useCallback(
    async (id: string, proof: ApprovalProof): Promise<string | null> => {
      const { error } = await supabase.from("approvals").insert({
        decision_id: id,
        signer: proof.signer,
        signature: proof.signature,
        signed_message: proof.signedMessage,
      });
      if (error) return "That payment can't be approved. Only held payments can be, and only once.";
      setApprovals((current) =>
        new Map(current).set(id, { decision_id: id, approved_at: new Date().toISOString(), approved_by: email, used_at: null }),
      );
      return null;
    },
    [email],
  );

  return { load, state, decisions, approvals, payments, fresh, live, now, freeze, approve };
}
