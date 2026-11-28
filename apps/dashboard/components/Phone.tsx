"use client";

import { useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ago, requestLabel, short, statusOf, toUsd, usd } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useOwnerData } from "@/lib/useOwnerData";
import { useOwnerWallet } from "@/lib/wallet";
import { ApproveButton } from "./ApproveButton";
import { ControlPanel } from "./ControlPanel";
import { Stamp } from "./Stamp";

const HELD_FOR_MS = 60 * 60 * 1000;

// The owner's phone: what needs a decision now, the kill switch, and the wallet that
// signs approvals. Built for Chrome on Android, where Mobile Wallet Adapter opens the
// wallet app on the same phone.
export function Phone({ session }: { session: Session }) {
  const email = session.user.email ?? "owner";
  const [buzz, setBuzz] = useState(0);
  const { load, state, decisions, approvals, live, now, freeze, approve } = useOwnerData(email, (decision) => {
    if (decision.decision === "REVIEW" && !decision.approved_by_owner) {
      setBuzz((count) => count + 1);
      try {
        navigator.vibrate?.([120, 80, 120]);
      } catch {
        // Vibration is optional.
      }
    }
  });

  const names = useMemo(
    () => new Map((state?.policy?.payees ?? []).map((payee) => [payee.address, payee.name])),
    [state?.policy],
  );

  const held = decisions.filter(
    (decision) =>
      statusOf(decision, approvals.get(decision.id), now).kind === "held" &&
      decision.payment !== null &&
      now - new Date(decision.created_at).getTime() < HELD_FOR_MS,
  );
  const recent = decisions.slice(0, 6);

  return (
    <div className="phone">
      <header className="masthead">
        <span className="wordmark">Oversign</span>
        <span className={`live ${live ? "live-on" : ""}`}>{live ? "Live" : "Connecting"}</span>
        <span className="masthead-gap" />
        <button className="button button-quiet" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      {load === "loading" && <p className="notice">Loading your agent.</p>}
      {load === "error" && <p className="notice">Supabase didn&apos;t answer. Check your connection, then reload.</p>}
      {load === "not-owner" && <p className="notice">{email} isn&apos;t an owner of this agent.</p>}
      {load === "no-agent" && <p className="notice">No agent yet. Start the Oversign service once.</p>}

      {load === "ready" && state && (
        <main className="phone-desk">
          <section className="phone-held" aria-labelledby="phone-held-title" key={buzz}>
            <h1 id="phone-held-title" className={`phone-title ${held.length > 0 ? "phone-title-held" : ""}`}>
              {held.length === 0
                ? "Nothing needs you right now."
                : held.length === 1
                  ? "One payment needs you."
                  : `${held.length} payments need you.`}
            </h1>
            {held.length === 0 && (
              <p className="quiet">Held payments appear here the moment Oversign holds one. Your phone buzzes when it does.</p>
            )}
            <ul className="phone-cards">
              {held.map((decision) => {
                const payee = decision.payment?.payee ?? "";
                return (
                  <li key={decision.id} className="phone-card">
                    <p className="phone-amount">{usd(toUsd(decision.payment?.amount))}</p>
                    <p>
                      To <strong>{names.get(payee) ?? short(payee, 6, 6)}</strong> for{" "}
                      <span className="mono">{requestLabel(decision.url).path}</span>
                    </p>
                    <ul className="phone-reasons">
                      {decision.reasons.map((reason) => (
                        <li key={reason.code}>{reason.message}</li>
                      ))}
                    </ul>
                    <p className="quiet small">Asked {ago(decision.created_at, now)}. Covers one retry within 10 minutes.</p>
                    <ApproveButton decision={decision} onApprove={approve} large />
                  </li>
                );
              })}
            </ul>
          </section>

          <ControlPanel state={state} now={now} onFreeze={freeze} />

          <WalletCard ownerWallet={state.policy?.ownerWallet ?? null} />

          <section aria-labelledby="phone-recent-title">
            <h2 id="phone-recent-title" className="section-title">
              Latest decisions
            </h2>
            <ul className="phone-recent">
              {recent.map((decision) => (
                <li key={decision.id}>
                  <Stamp status={statusOf(decision, approvals.get(decision.id), now)} />
                  <span>{decision.payment ? usd(toUsd(decision.payment.amount)) : ""}</span>
                  <span className="quiet small">{ago(decision.created_at, now)}</span>
                </li>
              ))}
            </ul>
            <p className="small">
              <a href="/">Open the full dashboard</a>
            </p>
          </section>
        </main>
      )}
    </div>
  );
}

function WalletCard({ ownerWallet }: { ownerWallet: string | null }) {
  const wallet = useOwnerWallet();
  const [copied, setCopied] = useState(false);
  const address = wallet.account?.address;
  const matches = address && ownerWallet === address;

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="wallet-card" aria-labelledby="wallet-title">
      <h2 id="wallet-title" className="section-title">
        Your approval wallet
      </h2>
      {ownerWallet ? (
        <p>
          Oversign trusts approvals signed by <span className="mono">{short(ownerWallet, 6, 6)}</span>.
        </p>
      ) : (
        <p>Oversign doesn&apos;t trust any wallet yet. Connect yours and add its address to the service.</p>
      )}
      {address ? (
        <>
          <p className={matches ? "wallet-ok" : "wallet-warn"}>
            {matches
              ? "This phone's wallet is the trusted one."
              : `Connected ${short(address, 6, 6)}, which Oversign doesn't trust yet.`}
          </p>
          {!matches && (
            <>
              <p className="mono wallet-address">{address}</p>
              <button className="button button-quiet" onClick={copy}>
                {copied ? "Copied" : "Copy address"}
              </button>
            </>
          )}
        </>
      ) : (
        wallet.available && (
          <button className="button button-ink" onClick={wallet.connect}>
            Connect your wallet
          </button>
        )
      )}
      {!wallet.available && (
        <p className="quiet small">Open this page in Chrome on Android with a Solana wallet app installed.</p>
      )}
      {wallet.error && (
        <p className="form-error" role="alert">
          {wallet.error}
        </p>
      )}
    </section>
  );
}
