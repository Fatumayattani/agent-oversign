import { createClient } from "@supabase/supabase-js";

// The dashboard only ever holds the publishable key. Everything it can see or change
// is decided by the database rules for the signed-in owner.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const configured = Boolean(url && key);

export const supabase = createClient(url ?? "http://localhost", key ?? "missing", {
  auth: { persistSession: true, autoRefreshToken: true },
});
