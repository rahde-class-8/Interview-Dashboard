"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "./env";

let client: SupabaseClient | undefined;

/**
 * Browser Supabase client used only for Realtime. It holds no session: the
 * short-lived access token comes from /api/v1/realtime/token and is passed to
 * realtime.setAuth(). All data reads and writes go through the app's API.
 */
export function getRealtimeClient() {
  if (!client) {
    const { url, publishableKey } = getSupabasePublicEnv();
    client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
