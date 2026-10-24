/**
 * Returns a same-origin path for post-login redirects, or the fallback.
 * Rejects absolute URLs, protocol-relative URLs ("//evil.com"), backslash tricks,
 * control characters and auth pages (to avoid redirect loops).
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;

  let url: URL;
  try {
    url = new URL(next, "http://placeholder.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://placeholder.invalid") return fallback;
  if (matchesPath(url.pathname, PUBLIC_PATHS)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Routes reachable without a session. Everything else requires sign-in. */
export const PUBLIC_PATHS = ["/login", "/register", "/forgot-password", "/auth"] as const;
/** Routes a signed-in user is redirected away from. */
export const GUEST_ONLY_PATHS = ["/login", "/register", "/forgot-password"] as const;

export function matchesPath(pathname: string, paths: readonly string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
