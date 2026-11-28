"use client";

import { useEffect, useState } from "react";
import { approvalMessage, toBase64, type ApprovalProof } from "@/lib/approval";
import { mwaSignMessage, mwaSupported } from "@/lib/mwa";
import { short } from "@/lib/format";
import type { Decision } from "@/lib/types";
import { useOwnerWallet } from "@/lib/wallet";

type Props = {
  decision: Decision;
  onApprove: (id: string, proof: ApprovalProof) => Promise<string | null>;
  large?: boolean;
};

// Approving is signing: the owner's wallet signs a message naming this exact payment,
// and Oversign checks that signature before it lets the payment through.
export function ApproveButton({ decision, onApprove, large = false }: Props) {
  const [android, setAndroid] = useState(false);
  useEffect(() => setAndroid(mwaSupported()), []);
  return android ? (
    <PhoneApprove decision={decision} onApprove={onApprove} large={large} />
  ) : (
    <BrowserApprove decision={decision} onApprove={onApprove} large={large} />
  );
}

// Android: one tap opens the wallet app, which connects and signs in one go.
function PhoneApprove({ decision, onApprove, large }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const signed = await mwaSignMessage(approvalMessage(decision));
      const failure = await onApprove(decision.id, {
        signer: signed.signer,
        signature: toBase64(signed.signature),
        signedMessage: toBase64(signed.signedMessage),
      });
      if (failure) setError(failure);
      else setDone(true);
    } catch (cause) {
      setError(`Your wallet didn't sign: ${(cause as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <div className="approve">
      <button className={`button button-ink ${large ? "button-large" : ""}`} disabled={busy || done || !decision.payment} onClick={approve}>
        {done ? "Approved" : busy ? "Waiting for your wallet" : "Approve with your wallet"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// Desktop: a Solana wallet extension in this browser, connected first, then signing.
function BrowserApprove({ decision, onApprove, large }: Props) {
  const wallet = useOwnerWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const size = large ? "button-large" : "";

  async function approve() {
    setBusy(true);
    setError(null);
    const signed = await wallet.sign(approvalMessage(decision));
    if (signed && wallet.account) {
      const failure = await onApprove(decision.id, {
        signer: wallet.account.address,
        signature: toBase64(signed.signature),
        signedMessage: toBase64(signed.signedMessage),
      });
      if (failure) setError(failure);
    }
    setBusy(false);
  }

  if (!wallet.available) {
    return (
      <p className="quiet small approve-elsewhere">
        Approvals are signed by your wallet. Open <span className="mono">/approve</span> on your Android phone to approve.
      </p>
    );
  }

  return (
    <div className="approve">
      {wallet.account ? (
        <button className={`button button-ink ${size}`} disabled={busy || !decision.payment} onClick={approve}>
          {busy ? "Waiting for your wallet" : "Approve with your wallet"}
        </button>
      ) : (
        <button className={`button button-ink ${size}`} onClick={wallet.connect}>
          Connect your wallet
        </button>
      )}
      {wallet.account && <span className="quiet small">Signing as {short(wallet.account.address, 4, 4)}</span>}
      {(error ?? wallet.error) && (
        <p className="form-error" role="alert">
          {error ?? wallet.error}
        </p>
      )}
    </div>
  );
}
