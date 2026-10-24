import "server-only";

import { ApiError, fromDatabaseError } from "./errors";
import { getSupabaseAdmin } from "./supabase/admin";

/**
 * Counts one use of `action` by the user and rejects with 429 once more than
 * `limit` uses fall in the current fixed window. Counters live in Postgres, so
 * the limit holds across server instances.
 */
export async function enforceRateLimit(userId: string, action: string, limit: number, windowSeconds = 3600) {
  const { data, error } = await getSupabaseAdmin().rpc("consume_rate_limit", {
    p_subject: userId,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw fromDatabaseError(error);
  if (!data) throw new ApiError(429, "rate_limited", "Too many requests. Please try again later.");
}
