import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/safe-redirect";
import { createSupabaseServerClient } from "@/server/core/supabase/server";

const ALLOWED_TYPES: EmailOtpType[] = ["email", "recovery", "email_change"];

/**
 * Handles links from Auth emails (confirmation, password recovery). Verifies the
 * one-time token hash, which establishes a session cookie, then redirects.
 * Works in any browser because it does not depend on a PKCE verifier.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? "/reset-password" : "/";
  const next = type === "recovery" ? "/reset-password" : safeNextPath(params.get("next"), fallback);

  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  const failure = new URL(type === "recovery" ? "/forgot-password" : "/login", request.url);
  failure.searchParams.set("error", "link_invalid");
  return NextResponse.redirect(failure);
}
