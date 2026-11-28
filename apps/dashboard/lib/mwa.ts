"use client";

import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol";
import bs58 from "bs58";

// Approving on Android with Mobile Wallet Adapter, in one tap and one wallet session:
// the wallet app opens, you confirm the connection and sign, and it comes back with the
// signature. Nothing is kept between approvals, so there is no session to lose.

export function mwaSupported(): boolean {
  if (typeof window === "undefined" || !window.isSecureContext) return false;
  return /android/i.test(navigator.userAgent);
}

const LAST_WALLET_KEY = "oversign-last-wallet";

export function lastWallet(): string | null {
  try {
    return localStorage.getItem(LAST_WALLET_KEY);
  } catch {
    return null;
  }
}

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type MwaSignature = { signer: string; signature: Uint8Array; signedMessage: Uint8Array };

export async function mwaSignMessage(message: string): Promise<MwaSignature> {
  const bytes = new TextEncoder().encode(message);
  return transact(async (wallet) => {
    const authorization = await wallet.authorize({
      chain: "solana:devnet",
      identity: { name: "Oversign", uri: window.location.origin, icon: "icon-192.png" },
    });
    const account = authorization.accounts[0];
    if (!account) throw new Error("The wallet didn't share an account.");

    const { signed_payloads } = await wallet.signMessages({
      addresses: [account.address],
      payloads: [toBase64(bytes)],
    });
    const payload = signed_payloads[0];
    if (!payload) throw new Error("The wallet returned no signature.");

    // The wallet returns the message with its 64-byte signature appended.
    const signed = fromBase64(payload);
    const signature = signed.slice(-64);
    const signer = bs58.encode(fromBase64(account.address));
    try {
      localStorage.setItem(LAST_WALLET_KEY, signer);
    } catch {
      // Only used to show which wallet signed last.
    }
    return { signer, signature, signedMessage: bytes };
  });
}
