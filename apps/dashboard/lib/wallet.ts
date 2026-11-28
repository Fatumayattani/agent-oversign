"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from "@solana-mobile/wallet-standard-mobile";
import { getWallets } from "@wallet-standard/app";
import { SolanaSignMessage, type SolanaSignMessageFeature } from "@solana/wallet-standard-features";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type { StandardConnectFeature } from "@wallet-standard/features";

let registered = false;

// Mobile Wallet Adapter lets this page ask a wallet app on the same Android phone to
// sign. On a desktop browser, any installed Solana wallet extension works the same way.
function registerOnce() {
  if (registered || typeof window === "undefined") return;
  registered = true;
  registerMwa({
    appIdentity: { name: "Oversign", uri: window.location.origin, icon: "icon-192.png" },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ["solana:devnet"],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });
}

type Signer = Wallet & { features: StandardConnectFeature & SolanaSignMessageFeature };

function canSign(wallet: Wallet): wallet is Signer {
  return "standard:connect" in wallet.features && SolanaSignMessage in wallet.features;
}

// One connection shared by every approve button on the page.
type Connection = { wallet: Signer; account: WalletAccount } | null;
let connection: Connection = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const setConnection = (next: Connection) => {
  connection = next;
  listeners.forEach((listener) => listener());
};

export function useOwnerWallet() {
  const [wallets, setWallets] = useState<Signer[]>([]);
  const current = useSyncExternalStore(subscribe, () => connection, () => null);
  const wallet = current?.wallet ?? null;
  const account = current?.account ?? null;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    registerOnce();
    const api = getWallets();
    const refresh = () => setWallets(api.get().filter(canSign));
    refresh();
    const offRegister = api.on("register", refresh);
    const offUnregister = api.on("unregister", refresh);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);

  // Prefer the phone's wallet app when it is there.
  const preferred = wallets.find((item) => item.name === "Mobile Wallet Adapter") ?? wallets[0] ?? null;

  // Restore a connection the wallet already approved, without opening the wallet app.
  // Android can reload this page while the wallet app is in front, which loses it.
  useEffect(() => {
    if (!preferred || connection) return;
    preferred.features["standard:connect"]
      .connect({ silent: true })
      .then(({ accounts }) => {
        if (accounts[0] && !connection) setConnection({ wallet: preferred, account: accounts[0] });
      })
      .catch(() => {});
  }, [preferred]);

  // Called from a tap, because Android Chrome only opens the wallet app on a user gesture.
  const connect = useCallback(async () => {
    setError(null);
    if (!preferred) {
      setError("No wallet found. Open this page in Chrome on your Android phone, with a Solana wallet app installed.");
      return;
    }
    try {
      const { accounts } = await preferred.features["standard:connect"].connect();
      const first = accounts[0];
      if (!first) throw new Error("The wallet didn't share an account.");
      setConnection({ wallet: preferred, account: first });
    } catch (cause) {
      setError(`The wallet didn't connect: ${(cause as Error).message}`);
    }
  }, [preferred]);

  const sign = useCallback(
    async (message: string): Promise<{ signature: Uint8Array; signedMessage: Uint8Array } | null> => {
      setError(null);
      if (!wallet || !account) {
        setError("Connect your wallet first.");
        return null;
      }
      try {
        // The wallet can lose its session while this page was in the background.
        // Restore it from the saved approval first, which needs no wallet screen.
        if (wallet.accounts.length === 0) {
          const { accounts } = await wallet.features["standard:connect"].connect({ silent: true });
          if (!accounts[0]) {
            setConnection(null);
            throw new Error("your wallet session ended. Tap Connect your wallet, then approve");
          }
        }
        const bytes = new TextEncoder().encode(message);
        const [output] = await wallet.features[SolanaSignMessage].signMessage({ account, message: bytes });
        if (!output) throw new Error("The wallet returned no signature.");
        // Some wallets return the message with the signature appended. Keep just the message.
        const signed = output.signedMessage;
        const signedMessage =
          signed.length === bytes.length + 64 && bytes.every((byte, index) => signed[index] === byte) ? bytes : signed;
        return { signature: output.signature, signedMessage };
      } catch (cause) {
        setError(`The wallet didn't sign: ${(cause as Error).message}`);
        return null;
      }
    },
    [wallet, account],
  );

  return { available: preferred !== null, walletName: preferred?.name, account, connect, sign, error };
}
