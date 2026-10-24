import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { GUEST_ONLY_PATHS, PUBLIC_PATHS, matchesPath, safeNextPath } from "@/lib/safe-redirect";
import { SESSION_COOKIE_OPTIONS, getSupabasePublicEnv } from "./env";

/**
 * Refreshes the Supabase session cookie and enforces route access:
 * - unauthenticated requests to app pages → /login?next=<path>
 * - authenticated requests to guest-only pages → next or /
 */
export async function updateSession(request: NextRequest) {
  const { url, publishableKey } = getSupabasePublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Do not run code between createServerClient and getUser (session refresh).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !matchesPath(pathname, PUBLIC_PATHS)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    const next = safeNextPath(`${pathname}${search}`, "");
    if (next && next !== "/") login.searchParams.set("next", next);
    return redirectWithCookies(login, response);
  }

  if (user && matchesPath(pathname, GUEST_ONLY_PATHS)) {
    const target = new URL(safeNextPath(request.nextUrl.searchParams.get("next")), request.url);
    return redirectWithCookies(target, response);
  }

  return response;
}

/** Redirect while keeping any refreshed session cookies. */
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
