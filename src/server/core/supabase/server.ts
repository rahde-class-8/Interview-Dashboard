import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { SESSION_COOKIE_OPTIONS, getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Request-scoped Supabase client acting as the signed-in user (RLS applies).
 * Use in Server Components, Server Actions and Route Handlers.
 */
export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session cookie, so this is safe to ignore.
        }
      },
    },
  });
}
