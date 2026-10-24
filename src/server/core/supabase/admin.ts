import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "@/lib/supabase/env";
import type { Database } from "../database.types";

let client: ReturnType<typeof create> | undefined;

function create() {
  const { url } = getSupabasePublicEnv();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not set (see docs/backend/ENVIRONMENT.md).");
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Privileged client using the secret key: bypasses RLS and Storage policies.
 * Server-only. Use it solely for operations the user client cannot perform
 * (signed Storage URLs, recording status transitions, scheduled jobs), and
 * only after the caller's permissions were checked with the user client.
 */
export function getSupabaseAdmin() {
  client ??= create();
  return client;
}

export type AdminSupabaseClient = ReturnType<typeof getSupabaseAdmin>;
