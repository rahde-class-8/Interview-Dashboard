# Security

Security model, controls, evidence and open risks. Status: **local MVP after Phase 8**;
production hardening items are listed in §7. Test evidence: [TESTING.md](TESTING.md) §4.

## 1. What we protect

| Asset | Sensitivity |
| --- | --- |
| Recruiter call notes, compensation, red flags | Personal / confidential |
| Call recordings (audio of third parties) | Highly sensitive personal data |
| Recruiter contact details | Personal data of third parties |
| Account credentials and sessions | Critical |
| Privileged keys (Supabase secret key, cron secret, database password) | Critical |

Principles: deny by default, enforce in the database, never trust the client, least privilege,
no public recordings, no audio in Postgres, no in-app recording (the browser's microphone and
camera are disabled by policy).

## 2. Architecture of trust

```
Browser ──cookie session──▶ Next.js /api/v1 (user-scoped Supabase client) ──RLS──▶ Postgres
   │                               │
   │                               └─ server-only secret key: signed Storage URLs,
   │                                  recording status changes, scheduled jobs
   ├─ signed upload/playback URLs ──────────────────────────────────▶ private Storage
   └─ short-lived access token ──▶ Realtime (private channels, membership policy)
```

* **The database is the authorization boundary.** Every table has RLS enabled *and forced*;
  client roles have explicit least-privilege table and column grants; `TRUNCATE` is revoked.
  The API checks roles first only to return precise errors.
* **The secret key** is used only in `src/server/core/supabase/admin.ts` (`import "server-only"`),
  only after the caller's role was verified with the user's RLS-bound client, and only for
  operations clients must not perform themselves.

## 3. Controls

### Authentication and sessions
* Supabase Auth, email + password (min 8 characters with a letter and a digit), email
  confirmation required, password reset by email (`token_hash` links, single use).
* Session cookies are **HttpOnly**, **SameSite=Lax** and **Secure** in production builds;
  `getUser()` (server-verified) is used for every authorization decision.
* No account enumeration: sign-in, sign-up and reset return neutral messages.
* Safe redirects: `next` parameters accept same-origin paths only (`safeNextPath`).
* Auth rate limits are Supabase's.

### Authorization
* Roles: owner > editor > commenter > viewer, checked by `app.has_workspace_role` in RLS
  policies. Composite `(id, workspace_id)` foreign keys prevent cross-workspace references.
* Non-members get `404` (no existence leak); insufficient roles get `403`.
* Server-only status transitions (recordings) and SECURITY DEFINER functions are
  allow-listed (`accept_invitation`, `preview_invitation`, role helpers) and asserted by pgTAP.
* Every one of the 75 workspace routes is tested for anonymous (401), outsider (404), viewer
  and commenter (403 above their role).

### API hardening
* Mutations require `application/json` and a same-origin `Origin` (CSRF defense on top of
  SameSite cookies); 1 MB body limit; zod validation with field errors.
* Database errors are mapped to safe messages; internals are never returned; error logs
  exclude bodies, cookies, tokens and signed URLs; every response has a request id.
* API responses are `Cache-Control: no-store`.
* Search input is escaped (LIKE wildcards, PostgREST filter quoting).
* Postgres-backed rate limits: recording upload starts (30/h), playback URLs (120/h),
  invitations (20/h), invitation token attempts (60/h).

### Recordings and Storage
* Private bucket, MIME allow-list, 100 MiB limit; **no `storage.objects` policies**, so clients
  cannot touch objects even with a valid session.
* Server-chosen object keys; one-time, path-bound upload URLs that cannot overwrite; size,
  content type and audio signature verified before playback; invalid files deleted.
* Playback only for owners and editors via 5-minute signed URLs, never stored or logged.
* Quotas (2 GiB/workspace, 10 per call), consent timestamp required, retention rules, a
  cleanup queue written in the same transaction as deletions, orphan reconciliation.
* Details: [STORAGE.md](STORAGE.md).

### Collaboration
* Invitation tokens: 256-bit, stored as SHA-256 only, single use, 7-day expiry, revocable,
  bound to the invited email (case-insensitive), sent in request bodies (not API URLs).
* Realtime: private channels; a membership RLS policy on `realtime.messages`; no client
  publishing; payloads carry ids only, so no content is ever pushed.
* Activity metadata holds display labels only (no notes, emails, phone numbers, file names).
* Details: [COLLABORATION.md](COLLABORATION.md).

### Browser
* Security headers on every response (`next.config.ts`):
  `Permissions-Policy: microphone=(), camera=(), geolocation=(), display-capture=(), payment=()`,
  `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'; object-src 'none';
  base-uri 'self'; form-action 'self'`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`,
  `Strict-Transport-Security` (effective over https); `X-Powered-By` removed.
* React escapes all rendered content; no `dangerouslySetInnerHTML`.

### Secrets and supply chain
* Only `.env.example` is committed; `.env.local` is git-ignored and written with mode 600.
* Nothing secret uses a `NEXT_PUBLIC_` prefix (`npm run supabase:check` enforces the naming).
* Automated checks: built JavaScript, served pages and API responses contain no secrets
  (`tests/api/security.spec.ts`); the repository contains no secret values or credential-shaped
  strings (`tests/integration/repository-secrets.test.ts`).
* `npm audit`: 0 vulnerabilities. Next.js's bundled `postcss` (advisories
  GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q and related) is pinned to a fixed release with an npm
  `overrides` entry (`postcss ^8.5.31`) instead of a breaking Next.js 16 upgrade; the build and
  every suite pass with it.

## 4. Threats and mitigations (summary)

| Threat | Mitigation | Evidence |
| --- | --- | --- |
| Cross-workspace data access | RLS on every table, composite FKs, 404 for non-members | pgTAP 006/007, security matrix |
| Privilege escalation by role | Role checks in RLS + API; owner cannot be granted by role change | pgTAP 006/007/010, security matrix |
| Public or unauthorized recording access | Private bucket, no object policies, signed short-lived URLs, role check | pgTAP 009, recordings spec |
| Malicious or oversized uploads | Allow-lists, size limits, signature verification, quotas | recordings spec, pgTAP 009 |
| Invitation token theft/reuse | Hash-only storage, single use, expiry, email binding, rate limit | collaboration spec, pgTAP 007/010 |
| CSRF | SameSite=Lax, Origin check, JSON-only mutations | access spec |
| XSS / clickjacking | React escaping, frame-ancestors 'none', X-Frame-Options | security spec (headers) |
| Secret leakage | Server-only modules, naming rules, automated scans | security spec, repository scan |
| Account enumeration | Neutral auth messages | auth spec, unit tests |
| Abuse / cost (storage, URL minting) | Quotas and per-user rate limits | recordings spec, pgTAP 009 |

## 5. Data handling

* Recordings are uploaded only after the user confirms that everyone recorded consented; the
  confirmation time is stored.
* Deletion removes Storage objects immediately (queue fallback); tombstones are purged after 30
  days; optional retention deletes recordings automatically (scheduling pending, §7).
* Deleting an account (currently an administrator action; no self-service yet) removes the
  user's own workspaces and everything in them.
* Encryption at rest and in transit is provided by the hosting platform (Supabase/Vercel);
  there is no additional application-level encryption.

## 6. Accepted risks (documented trade-offs)

| Risk | Why accepted | Mitigation |
| --- | --- | --- |
| Signed playback URLs are bearer links for up to 5 minutes | Streaming directly from Storage avoids proxying audio | Short TTL, owner/editor only, never stored or logged |
| The Realtime access token is readable by page scripts | Needed for private channels | Short-lived; refresh token stays HttpOnly; payloads are ids only |
| Removed members keep receiving id-only notifications until their token refreshes (≤ 1 h) | Realtime re-authorizes on join/refresh | All data reads are denied immediately |
| Invitation links contain the token in the page URL (`/invite/<token>`) | Shareable links | Single use, email-bound, 7-day expiry, revocable, strict referrer policy |
| No script-src CSP yet | Requires nonce plumbing for Next.js inline scripts | Other CSP directives and headers set; planned for deployment |

## 7. Before production (Phase 9)

* Script-src Content Security Policy with nonces; confirm HSTS on the real domain.
* Hosted Supabase: disable public sign-ups if needed, configure SMTP (D9), set the global
  Storage limit ≥ 100 MiB, rotate keys, restrict dashboard access, enable backups/PITR.
* Schedule the recording maintenance job; error monitoring with PII scrubbing; log retention.
* Separate staging and production projects and secrets; least-privilege deploy credentials.
* Review Supabase Auth rate limits and enable CAPTCHA if abuse appears.
* Data export and account deletion self-service.

## 8. Reporting a vulnerability

This project has no public deployment yet. Report issues privately to the repository owner;
do not open public issues containing exploit details.
