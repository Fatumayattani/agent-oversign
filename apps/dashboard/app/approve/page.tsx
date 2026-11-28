"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "@/lib/supabase";
import { Login } from "@/components/Login";
import { Phone } from "@/components/Phone";

export default function ApprovePage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) return <p className="notice">The dashboard isn&apos;t connected to Supabase yet.</p>;
  if (session === undefined) return null;
  return session ? <Phone session={session} /> : <Login />;
}
