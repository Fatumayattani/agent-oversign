"use client";

import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";
import { Seal } from "./Seal";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError("That email and password don't match an owner account.");
    setBusy(false);
  }

  return (
    <main className="login">
      <Seal frozen={false} size={180} />
      <h1 className="login-title">Oversign</h1>
      <p className="login-lede">Sign in to see what your agent is paying for, and to stop it.</p>
      <form className="login-form" onSubmit={submit}>
        <label>
          <span>Email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-ink" type="submit" disabled={busy}>
          {busy ? "Signing in" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
