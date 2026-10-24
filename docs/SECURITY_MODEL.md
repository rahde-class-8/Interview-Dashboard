# Security Model

> **Superseded (planning draft).** The current backend design is in [`docs/backend/`](./backend/ARCHITECTURE.md). This file is kept for reference until it is removed (decision D8).

Status: **Proposed**
Covers: authentication, workspace ownership, authorization (roles + RLS), data protection,
threat model, and security requirements. Recording-specific controls are detailed in
[RECORDING_STORAGE](./RECORDING_STORAGE.md).

## 1. Principles

1. **Workspace is the tenant boundary.** Every domain row carries `workspace_id`; access is
   granted only through `workspace_members`.
2. **The database enforces authorization.** RLS applies to every query, including ones
   that bypass the Next.js API through Supabase's public Data API.
3. **Least privilege.** Recordings are restricted beyond normal read access; the service
   role key is used only for jobs.
4. **Private by default.** No public buckets, no public URLs, no anonymous table access.
5. **Minimize sensitive data.** Recruiter contacts, call notes and recordings are personal
   data; they never appear in logs, analytics, activity metadata or error reports.

## 2. Authentication

| Item | Decision |
| --- | --- |
| Provider | Supabase Auth |
| MVP methods | Email magic link (OTP) and Google OAuth. Email + password optional (decision pending). |
| Session | `@supabase/ssr` cookie session (PKCE flow); access JWT lifetime 1 h; refresh token rotation and reuse detection enabled |
| Cookies | `HttpOnly`, `Secure`, `SameSite=Lax`, host-only |
| Route protection | `middleware.ts` refreshes the session and redirects unauthenticated requests for app routes to `/sign-in`; API routes return `401` |
| Server identity | Always `supabase.auth.getUser()` (validates with Auth server) — never trust `getSession()` data on the server |
| Sign-up side effects | `app.handle_new_user()` creates the profile, a personal workspace and an `owner` membership in one transaction |
| Email confirmation | Required before first sign-in (magic link implies confirmation) |
| MFA | Post-MVP (TOTP via Supabase Auth) |
| Account deletion | `DELETE /api/v1/me` → deletes owned workspaces (cascade), enqueues all their recordings for purge, removes memberships elsewhere, deletes the auth user |

## 3. Workspace ownership

- Each user gets a **personal workspace** at sign-up and may create more.
- Exactly **one owner** per workspace (partial unique index). Ownership changes only via
  `transfer_ownership()`; the owner cannot leave or be removed without transferring.
- Deleting a workspace (owner only, typed confirmation) cascades all rows and enqueues all
  recording objects for deletion.
- A user can belong to many workspaces; the active workspace is part of every API path
  (`/api/v1/workspaces/{workspaceId}/...`), so there is no ambient "current workspace" state
  on the server.

## 4. Roles and permissions

Roles are ranked: `owner (4) > editor (3) > commenter (2) > viewer (1)`.

| Capability | Owner | Editor | Commenter | Viewer |
| --- | :-: | :-: | :-: | :-: |
| Read opportunities, calls, interviews, tasks, prep content, notes, activity | ✅ | ✅ | ✅ | ✅ |
| See that a recording exists (metadata: name, size, duration) | ✅ | ✅ | ✅ | ✅ |
| **Play / download recordings** | ✅ | ✅ | ❌ | ❌ |
| Create / edit / delete domain records | ✅ | ✅ | ❌ | ❌ |
| Upload recordings | ✅ | ✅ | ❌ | ❌ |
| Delete a recording | ✅ any | ✅ own uploads | ❌ | ❌ |
| Comment on shared notes | ✅ | ✅ | ✅ | ❌ |
| Edit / delete own comment | ✅ | ✅ | ✅ | — |
| Delete any comment | ✅ | ❌ | ❌ | ❌ |
| Invite, change roles, remove members, revoke invites | ✅ | ❌ | ❌ | ❌ |
| Workspace settings (name, retention, quota view) | ✅ | ❌ | ❌ | ❌ |
| Transfer ownership, delete workspace | ✅ | ❌ | ❌ | ❌ |
| Leave workspace | — (transfer first) | ✅ | ✅ | ✅ |

Recording playback is limited to owner/editor because recordings contain a third party's
voice. A workspace setting to extend playback to commenters/viewers is a product decision
(see ARCHITECTURE §8).

## 5. Row Level Security

### 5.1 Baseline

- `alter table ... enable row level security` **and** `force row level security` on every
  table in `public`.
- `revoke all on all tables in schema public from anon;` — anonymous users have no table
  access at all.
- `authenticated` receives only the privileges each table needs (e.g. no `UPDATE`/`DELETE`
  on `activity_events`).
- Policies use `(select auth.uid())` (evaluated once per statement) and the helper:

```sql
create function app.has_workspace_role(ws uuid, min_role text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
      and app.role_rank(m.role) >= app.role_rank(min_role)
  );
$$;
```

### 5.2 Policy pattern for domain tables

Applies to `companies`, `recruiters`, `opportunities`, `recruiter_calls`,
`call_candidate_questions`, `interviews`, `tasks`, `star_stories`, `interview_questions`,
`shared_notes`:

```sql
create policy read   on public.opportunities for select using (app.has_workspace_role(workspace_id, 'viewer'));
create policy insert on public.opportunities for insert with check (app.has_workspace_role(workspace_id, 'editor'));
create policy update on public.opportunities for update using (app.has_workspace_role(workspace_id, 'editor'))
                                                     with check (app.has_workspace_role(workspace_id, 'editor'));
create policy delete on public.opportunities for delete using (app.has_workspace_role(workspace_id, 'editor'));
```

`WITH CHECK` on update prevents moving a row into another workspace. Composite foreign
keys additionally prevent linking to a parent in another workspace.

### 5.3 Special cases

| Table | Policy |
| --- | --- |
| `profiles` | Select: self, or users sharing a workspace with you. Update: self only. Insert: trigger only. |
| `workspaces` | Select: members. Update: owner. Insert: any authenticated user with `owner_id = auth.uid()` (membership row created in the same RPC). Delete: owner. |
| `workspace_members` | Select: members of that workspace. Insert/update: **no direct policies** — only via `SECURITY DEFINER` RPCs that enforce owner-only and the single-owner invariant. Delete: one policy allowing a non-owner to delete **their own** row (leave); removing others goes through the owner-only RPC. |
| `workspace_invitations` | Select/insert/update: owner. Token hash column is never returned by the API. Acceptance only via `accept_invitation()`. |
| `recording_attachments` | Select: viewer+ (metadata). Insert: editor+ with `uploaded_by = auth.uid()` and `status = 'pending_upload'`. Update: editor+ restricted to `duration_seconds`; status transitions only via server (service role) after verification. Delete: none (soft-delete via API → service). |
| `comments` | Select: viewer+. Insert: commenter+ and `author_id = auth.uid()`. Update: author only. Delete (soft): author or owner. |
| `activity_events` | Select: viewer+. Insert: only via `app.log_activity()`. No update/delete. |
| `storage_deletion_queue` | No policies for `authenticated` (service role only). |
| `storage.objects` (bucket `recordings`) | No `select`/`insert`/`update`/`delete` policies for `authenticated` or `anon`. All access goes through server-issued signed URLs. |

### 5.4 Function-level authorization

Route Handlers also check role before acting, to return precise `403` errors and to guard
service-role code paths. The API check is a usability layer; RLS remains authoritative for
every user-JWT query. Service-role code (jobs, recording verification, signed URL issuance)
**must** call `assertWorkspaceRole()` itself because RLS does not apply to it.

## 6. Data protection

| Data | Classification | Controls |
| --- | --- | --- |
| Recordings | Highly sensitive (third-party voice) | Private bucket, signed URLs ≤ 5 min, owner/editor only, retention + verified deletion, consent attestation |
| Call notes, red flags, compensation | Sensitive personal/professional | RLS, TLS, encryption at rest (Supabase default AES-256), excluded from logs |
| Recruiter contact details | Personal data (third party) | Same as above; export + deletion supported |
| Profiles, emails | Personal data | Visible only to co-members |
| Activity metadata | Internal | Labels only; no notes, contacts, paths or URLs |

- **Transport:** HTTPS only, HSTS (`max-age=63072000; includeSubDomains`).
- **Logging:** structured logs with request ID, user ID, workspace ID, route, status,
  latency. Request/response bodies, `Authorization`/cookie headers, signed URLs and file
  names are redacted.
- **Error reporting:** no PII in messages; stack traces server-side only.
- **Backups:** Supabase daily backups + PITR on production. Backups include DB metadata,
  not storage objects (see RECORDING_STORAGE §8).
- **Data subject requests:** account deletion (above) and JSON export (post-MVP P1).

## 7. Application security requirements

| ID | Requirement |
| --- | --- |
| SEC-1 | Service role key only in server env (`SUPABASE_SERVICE_ROLE_KEY`, never `NEXT_PUBLIC_*`), imported only in `server-only` modules; CI greps the client bundle for the key prefix |
| SEC-2 | All inputs validated with zod (types, lengths, enums, UUID format) before any DB call |
| SEC-3 | CSRF: state-changing routes require `Content-Type: application/json` and a same-origin `Origin` header; cookies `SameSite=Lax` |
| SEC-4 | Security headers: CSP (`default-src 'self'`; `media-src 'self' https://<project>.supabase.co`; `connect-src 'self' https://<project>.supabase.co`; no `unsafe-eval` in production), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: microphone=(), camera=()`, `frame-ancestors 'none'` |
| SEC-5 | No `dangerouslySetInnerHTML`; user text rendered as text only |
| SEC-6 | Rate limits (per user, per IP): auth via Supabase built-ins; invitations 20/day/workspace; upload init 30/hour/user; playback URLs 120/hour/user; general writes 300/min/user. MVP implementation: Postgres-backed fixed-window counter table accessed by the API |
| SEC-7 | Uniform `404` for resources outside the caller's workspaces (no existence leaks) |
| SEC-8 | Invitation tokens: 32 random bytes, stored as SHA-256, single use, 7-day expiry, bound to the invited email |
| SEC-9 | Dependency scanning (`npm audit --omit=dev` + Dependabot) and secret scanning in CI |
| SEC-10 | Every new table migration includes RLS policies; CI check fails otherwise |
| SEC-11 | `Permissions-Policy: microphone=()` and no `getUserMedia` usage — the app never records audio |

## 8. Threat model (STRIDE)

| # | Threat | Vector | Impact | Mitigation | Verified by |
| --- | --- | --- | --- | --- | --- |
| T1 | Cross-workspace data access (IDOR) | Guessing/reusing UUIDs in API or Data API | Critical | RLS on all tables, composite FKs, uniform 404, tests per role | RLS matrix tests, API IDOR suite |
| T2 | Privilege escalation by member | Editor calls member APIs, or updates own role via Data API | High | No direct write policies on `workspace_members`; owner-only RPCs | RLS tests |
| T3 | Recording leakage | Public bucket, long-lived URL, URL in logs/referrer | Critical | Private bucket, no storage policies, 5-min signed URLs, log redaction, `Referrer-Policy` | Storage tests |
| T4 | Malicious upload | Executable/HTML disguised as audio, oversized files | Medium | Ext + MIME + magic-byte verification, bucket MIME allow-list and size limit, server-chosen path, `nosniff` | Upload tests |
| T5 | Service role key exposure | Client bundle, logs, repo | Critical | `server-only`, env management, bundle grep, secret scanning, key rotation runbook | CI check |
| T6 | Session theft / CSRF | XSS, cross-site requests | High | HttpOnly cookies, CSP, SameSite, Origin check, no inline HTML | Header tests, E2E |
| T7 | Invitation abuse | Token reuse, brute force, spam | Medium | Hashed single-use tokens, email binding, expiry, rate limits | API tests |
| T8 | `SECURITY DEFINER` misuse | Search-path hijack, missing auth check | High | `search_path = ''`, explicit `auth.uid()` checks, `EXECUTE` grants restricted | pgTAP |
| T9 | Orphaned recordings remain after deletion | FK cascade without storage delete | High (privacy) | Deletion queue trigger + purge job + reconciliation job | Job tests, metrics |
| T10 | Denial of wallet | Mass uploads / streaming | Medium | Quotas, rate limits, size cap, short URL TTL | Load tests |
| T11 | Repudiation of destructive actions | No record of who deleted what | Low | Activity events for deletes, stage changes, membership changes | Integration tests |
| T12 | Sensitive data in logs/analytics | Logging bodies or URLs | Medium | Redaction middleware, no third-party analytics on app pages in MVP | Log review in tests |

## 9. Compliance notes (for product/legal review)

- Recording consent laws differ by jurisdiction (one-party vs all-party consent). The app
  does not record, but stores user-uploaded recordings; uploads require the user to attest
  they had the right to record and store the call (`consent_attested_at`).
- Recruiter details are third-party personal data; provide deletion and retention controls.
- Choose the Supabase region to match data-residency expectations before production data exists.
