import type { NextConfig } from "next";

/**
 * Security headers for every response (pages and API).
 * - Permissions-Policy disables the microphone and camera: the app never records calls.
 * - The CSP restricts framing, plugins, base URLs and form targets. A script-src policy
 *   (nonces for Next.js inline scripts) is planned with deployment (docs/backend/SECURITY.md).
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(), camera=(), geolocation=(), display-capture=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  // Ignored by browsers over plain http (local development); effective once served over https.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
