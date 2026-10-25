import "server-only";

import type { NextRequest } from "next/server";

import type { RealtimeToken } from "@/shared/contracts/collaboration";
import { json, type ApiContext } from "../core/api";
import { ApiError } from "../core/errors";

export const realtime = {
  /**
   * GET /realtime/token — the signed-in user's short-lived access token, so the
   * browser can join private Realtime channels (supabase.realtime.setAuth()).
   * Session cookies stay HTTP-only; the refresh token is never returned.
   * Channel access is authorized by the realtime.messages policy (members only).
   */
  async token(_request: NextRequest, ctx: ApiContext<Record<string, never>>) {
    const {
      data: { session },
    } = await ctx.supabase.auth.getSession();
    if (!session) throw new ApiError(401, "unauthenticated", "Sign in to continue.");
    const expiresAt = new Date((session.expires_at ?? Math.floor(Date.now() / 1000) + 60) * 1000).toISOString();
    return json<RealtimeToken>({ accessToken: session.access_token, expiresAt });
  },
};
