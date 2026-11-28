"use client";

import { useState } from "react";
import { approvalMessage, toBase64, type ApprovalProof } from "@/lib/approval";
import { short } from "@/lib/format";
import type { Decision } from "@/lib/types";
import { useOwnerWallet } from "@/lib/wallet";

type Props = {
  decision: Decision;
  onApprove: (id: string, proof: ApprovalProof) => Promise<string | null>;
  large?: boolean;
};

// Approving is signing: the owner's wallet signs a message naming this exact payment,
// and Oversign checks that signature before it lets the payment through. Two taps,
// because Android only opens the wallet app in direct response to a tap.
export function ApproveButton({ decision, onApprove, large = false }: Props) {
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
      {wallet.account && (
        <span className="quiet small">Signing as {short(wallet.account.address, 4, 4)}</span>
      )}
      {(error ?? wallet.error) && (
        <p className="form-error" role="alert">
          {error ?? wallet.error}
        </p>
      )}
    </div>
  );
}
