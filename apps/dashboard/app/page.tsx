"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { configured, supabase } from "@/lib/supabase";
import { Dashboard } from "@/components/Dashboard";
import { Login } from "@/components/Login";

export default function Home() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!configured) {
    return (
      <p className="notice">
        Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart the dashboard.
      </p>
    );
  }
  if (session === undefined) return null;
  return session ? <Dashboard session={session} /> : <Login />;
}
