/** Public Supabase settings (safe for the browser). Fails loudly if misconfigured. */
export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see docs/backend/ENVIRONMENT.md).",
    );
  }
  return { url, publishableKey };
}

/**
 * Session cookie options. @supabase/ssr defaults to `httpOnly: false` so browser
 * clients can read the session; this app performs auth on the server only, so the
 * cookies are HTTP-only (not readable by injected scripts). `Secure` in production
 * builds (browsers allow Secure cookies on http://localhost).
 */
export const SESSION_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
} as const;
