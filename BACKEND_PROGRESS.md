# Backend Progress

Tracks the backend implementation defined in the Backend Engineering Implementation
Specification. Statuses: **Not Started / In Progress / Blocked / Complete**.

| Phase | Status | Gate |
| --- | --- | --- |
| 0 — Repository and architecture audit | **Complete — approved** (D2–D10 as recommended) | Architecture reviewed and approved |
| 1 — Development environment | **Complete (local)** · staging/production config Not Started | Local services start successfully ✅ |
| 2 — Database architecture | **Complete** | Migrations and relationship tests pass |
| 3 — Authentication and authorization | **Complete** | RLS and permission tests pass |
| 4 — Application services | **Complete** | Core CRUD operations work |
| 5 — Recording storage | **Complete** | Authorized uploads and playback work ✅ |
| 6 — Collaboration | **Complete** | Role-based sharing is enforced ✅ |
| 7 — Frontend integration | **Complete** | Frontend workflows persist real data ✅ |
| 8 — Testing and QA | **Complete** | Critical security tests pass ✅ |
| 9 — Deployment and operations | Not Started | Security, recovery and deployment checks pass |

---

## Phase 0 — Repository and Architecture Audit

**Status:** Complete — approved 2026-10-24 (D2–D10 as recommended; D1 resolved in Phase 1).

### Completed tasks

- Inspected the repository (`main` @ `80960f1`, planning branch @ `8c73867`), `README.md`,
  `FRONTEND_PROGRESS.md` and the earlier planning drafts in `docs/`.
- Catalogued pages, components, types, mock data, the client store and the 29 `useActions()` mutations.
- Identified complete UI workflows, integration requirements and specification gaps (G1–G9).
- Checked the local toolchain and network reachability for the required stack.
- Wrote `docs/backend/ARCHITECTURE.md` (architecture, ERD, auth, authorization, API,
  storage, deployment, security, risks, decisions D1–D10).

### Files created or modified

- Created `docs/backend/ARCHITECTURE.md`, `BACKEND_PROGRESS.md`.
- Modified `docs/*.md` (7 planning drafts): added a "superseded" banner pointing to `docs/backend/`.
- No application code, migrations or environment files changed.

### Database migrations

None.

### Tests executed and results

| Check | Result |
| --- | --- |
| Node.js / npm | v22.22.0 / 10.9.4 — OK |
| Docker daemon start | OK (overlayfs, cgroup v1) — stopped again after the check |
| Supabase CLI (`npm i supabase@2.122.0`, `supabase --version`) | OK — 2.122.0 (temporary install removed) |
| Container image pull | **Failed** — `public.ecr.aws`: "Data limit exceeded"; Docker Hub: `429 Too Many Requests`; GHCR blobs: denied by network policy |
| `api.supabase.com`, `supabase.com` | **Denied** by network policy |
| Planning DDL on PostgreSQL 16 (earlier session) | 18 tables created; 10 invariant checks behaved as designed (composite FKs, unique owner, checks, restrict/cascade) |

### Outstanding issues

- **D1 (blocking for full local stack):** Supabase Docker images cannot be pulled in this environment.
- Decisions D2–D10 in `docs/backend/ARCHITECTURE.md` §11 need confirmation.

### Architectural decisions (proposed)

Modular monolith in Next.js; Route Handlers for data + Server Actions for auth forms;
RLS as the authoritative boundary; composite FKs for workspace integrity; transactional
Postgres functions for composite writes; private bucket with signed URLs; record-level
Realtime only (no co-editing).

### Next recommended action

Review `docs/backend/ARCHITECTURE.md` and approve or amend decisions D1–D10. On approval,
start Phase 1 (environment) on a new branch.

---

## Phase 1 — Development Environment (local)

**Status:** Complete for local development (verified 2026-10-24). Staging and production
configuration not started — requires approval for cloud resources. Architecture decisions
D1–D10 from Phase 0 are still open; D1 (local environment) is resolved by this phase.

### Completed tasks

- Inspected OS and toolchain: Ubuntu 24.04.5 LTS (x86_64), Node 22.22.0, npm 10.9.4,
  Git 2.43.0, Docker Engine 29.9.1, Docker Compose v5.6.0. Nothing needed installing.
- Started the Docker daemon (`dockerd`; container has no systemd). No permission, group,
  package or cleanup changes. No pre-existing containers, images or volumes existed.
- Added the Supabase CLI as an exact-pinned dev dependency (`supabase@2.122.0`) and ran
  `npx supabase init` (no prior configuration existed).
- Started local Supabase. Image pulls from ECR public and GHCR are blocked by the
  container's network policy; Docker Hub served all images after rate-limit retries
  (Auth and Mailpit needed retries; Mailpit succeeded on attempt 6). Full stack runs.
- Created `.env.local` from `supabase status` via `npm run env:local` (mode 600,
  git-ignored), and documented every variable in `.env.example`.
- Added `npm run supabase:start|stop|status|check` and `env:local`.
- Wrote `docs/backend/ENVIRONMENT.md`.

### Files created or modified

- Created: `supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/.gitkeep`,
  `scripts/write-local-env.mjs`, `scripts/check-local-supabase.mjs`,
  `docs/backend/ENVIRONMENT.md`, `.env.local` (not committed).
- Modified: `package.json` (dev dependency + scripts), `package-lock.json`, `.env.example`,
  `BACKEND_PROGRESS.md`.
- No application source files changed.

### Database migrations

None (by design — schema work starts in Phase 2).

### Tests executed and results

| Check | Command | Result |
| --- | --- | --- |
| Docker daemon | `docker info` | ✅ 29.9.1, overlayfs, cgroup v1 |
| Temporary container | `docker run --rm kong:2.8.1 kong version` | ✅ `2.8.1` (hello-world could not be pulled: registry limits) |
| Docker Compose | `docker compose run --rm probe` (temporary project, removed) | ✅ |
| Supabase CLI | `npx supabase --version` | ✅ 2.122.0 |
| Local Supabase start | `npx supabase start` | ✅ 12 containers up/healthy (imgproxy, pooler disabled by config) |
| PostgreSQL | `psql "$DB_URL" -c 'select version()'` | ✅ 17.11; `auth`, `storage`, `realtime`, `public` schemas present |
| Auth | `GET /auth/v1/health` | ✅ 200, GoTrue v2.197.0 |
| REST API | `GET /rest/v1/` (publishable key) | ✅ 200 |
| Storage | `GET /storage/v1/bucket` (secret key, server-side) | ✅ 200, no buckets yet |
| Realtime | tenant health (secret key) / container health | ✅ 200 / healthy |
| Studio | `GET http://127.0.0.1:54323` | ✅ 307 → 200 |
| Mail catcher | `GET http://127.0.0.1:54324` | ✅ 200 |
| Next.js env wiring | `npm run supabase:check` (loads env via `@next/env`) | ✅ Auth 200, REST 200, endpoint local |
| Stop / restart keeps data | `supabase stop` → volumes kept (3) → `supabase start` | ✅ |
| Frontend | `npm run lint`, `npx tsc --noEmit`, `npm run build` | ✅ all pass |
| Secret exposure | grep secret key in `.next/` and committed files | ✅ 0 matches (only in git-ignored `.env.local` and CLI cache `supabase/.temp/`) |
| No data deleted | `git status` (only additions/modifications); no Docker cleanup run | ✅ |

### Outstanding issues

- `npm audit --omit=dev`: 2 findings (1 high, 1 moderate) in the `postcss` copy bundled
  inside `next`; pre-existing, not introduced by this phase. Fix requires a Next.js upgrade —
  to be scheduled separately.
- Local gateway lets keyless requests reach PostgREST as `anon` → RLS must deny `anon`
  (to be covered by Phase 2/3 tests).
- Storage `file_size_limit` is `50MiB` locally vs 100 MB in the UI — align in Phase 5 (D5).
- In the cloud container, image pulls depend on Docker Hub rate limits (ECR/GHCR blocked).

### Architectural decisions

- Supabase CLI pinned per project (no global install).
- New-style keys: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser) and
  `SUPABASE_SECRET_KEY` (server only); the env writer refuses non-local targets.

### Next recommended action

Approve or amend Phase 0 decisions D2–D10 (`docs/backend/ARCHITECTURE.md` §11), then start
Phase 2: first migrations (identity/workspace tables, RLS baseline) with pgTAP tests
against this local stack.

---

## Phase 2 — Database Architecture

**Status:** Complete (2026-10-24). Gate "migrations and relationship tests pass": ✅ 97/97.

### Completed tasks

- Six version-controlled migrations creating all 14 required tables plus the four approved
  additions (`follow_up_tasks`, `shared_notes`, `star_stories`, `storage_cleanup_queue`).
- UUID primary keys, `created_at`/`updated_at` (trigger-maintained), explicit deletion
  behavior on every foreign key, indexes for every foreign key and list sort order.
- Workspace ownership: owner auto-membership, exactly-one-owner index, owner protection
  trigger, sign-up bootstrap (profile + personal workspace), profile email sync.
- Workspace isolation via composite `(id, workspace_id)` foreign keys on all 13 child relations.
- Business rules as constraints: compensation completeness/range, enumerations, size limits,
  candidate Q&A shape, follow-up ↔ call opportunity consistency, server-shaped recording paths,
  recording status consistency, mandatory consent timestamp, append-only activity log.
- Storage cleanup queue filled by triggers on soft delete, delete and cascades.
- Deny-by-default security baseline: RLS enabled + forced on all tables (no policies yet),
  no `anon` privileges, no PUBLIC function execution, private `app` schema for helpers.
- Removed the superseded planning drafts in `docs/*.md` (D8).
- Wrote `docs/backend/DATABASE.md`; added `db:new`, `db:reset`, `db:lint`, `test:db` scripts.

### Files created or modified

- Created: `supabase/migrations/20261024170000_baseline.sql`, `…170100_identity.sql`,
  `…170200_recruitment.sql`, `…170300_recordings.sql`, `…170400_interview_intelligence.sql`,
  `…170500_collaboration.sql`; `supabase/tests/database/001_schema.test.sql` … `005_recordings.test.sql`;
  `docs/backend/DATABASE.md`.
- Modified: `package.json` (scripts), `docs/backend/ARCHITECTURE.md`, `docs/backend/ENVIRONMENT.md`,
  `BACKEND_PROGRESS.md`.
- Deleted: `docs/API_CONTRACTS.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`,
  `docs/IMPLEMENTATION_ROADMAP.md`, `docs/RECORDING_STORAGE.md`, `docs/SECURITY_MODEL.md`,
  `docs/TEST_PLAN.md` (superseded; in git history).
- `supabase/migrations/.gitkeep` removed (directory now has real migrations).

### Database migrations

| Migration | Applied locally |
| --- | --- |
| `20261024170000_baseline` | ✅ |
| `20261024170100_identity` | ✅ |
| `20261024170200_recruitment` | ✅ |
| `20261024170300_recordings` | ✅ |
| `20261024170400_interview_intelligence` | ✅ |
| `20261024170500_collaboration` | ✅ |

Not applied to any hosted project (none exist).

### Tests executed and results

| Check | Result |
| --- | --- |
| `npx supabase db reset` (all migrations from scratch) | ✅ |
| `npm run db:lint` | ✅ no schema errors |
| `npm run test:db` — 001 schema (11), 002 identity (22), 003 relationships (26), 004 constraints (24), 005 recordings (14) | ✅ 97/97 |
| Mutation check: dropped the recording path check and one composite FK | ✅ suite failed on exactly those tests (4 failures); restored and green again |

Defects found by the tests and fixed before commit:

1. `app.set_updated_at()` was created before default privileges were revoked, so `anon`
   could execute it → baseline reordered + explicit revoke.
2. `opportunities → companies` used `RESTRICT`, whose immediate check made workspace
   deletion depend on internal trigger order → changed to `NO ACTION`.

### Outstanding issues

- No RLS policies yet: client roles can read/write nothing (intentional until Phase 3).
- `activity_events` append-only trigger only becomes reachable for client roles once
  policies exist; it will be re-tested in Phase 3.
- Transactional multi-record writes (`log_recruiter_call`, etc.) are implemented with the
  services in Phase 4, because they depend on Phase 3 authorization.
- No `supabase/seed.sql` yet (fictional demo data) — planned with auth test accounts in Phase 3.
- `npm audit` finding in Next.js' bundled `postcss` still open (from Phase 1).

### Architectural decisions

- Text + `CHECK` instead of Postgres enums; `jsonb` for call Q&A; helper functions in a
  private `app` schema; `NO ACTION` for "block while referenced" relations.
- Recording IDs are generated by the server before insert so the storage path can be
  validated against the ID by a constraint.

### Next recommended action

Phase 3 — Authentication and authorization: role helper (`app.has_workspace_role`),
RLS policies for every table, invitation acceptance function, Supabase Auth pages
(register, login, logout, password reset), middleware route protection, and the
role × table × operation pgTAP matrix.

---

## Phase 3 — Authentication and Authorization

**Status:** Complete (2026-10-24). Gate "RLS and permission tests pass": ✅
(pgTAP 376/376, Vitest 40/40, Playwright 4/4).

### Completed tasks

- **Database authorization** (`20261024180000_authorization.sql`): role helpers
  (`app.role_rank`, `app.has_workspace_role`, `app.shares_workspace_with`); replaced Supabase's
  broad default grants (incl. RLS-bypassing `TRUNCATE`) with least-privilege table/column
  grants; RLS policies for all 18 tables per the approved matrix; owner-only moderation
  guard on comments; `public.accept_invitation` (hashed, single-use, expiring, email-bound).
- **Supabase Auth**: email + password, email confirmation required (also locally),
  8+ character passwords with letters and digits, `token_hash` email templates for
  confirmation and recovery, `site_url` = `http://localhost:3000`.
- **App**: Server Actions `signIn`, `signUp`, `signOut`, `requestPasswordReset`,
  `updatePassword` with shared zod validation; `/auth/confirm` route; pages `/login`,
  `/register`, `/forgot-password`, `/reset-password`; middleware session refresh + route
  protection with sanitized `next` redirects; server-side user check in the app layout;
  real user name/email and working Sign out in the header.
- **Session hardening**: auth cookies HttpOnly, SameSite=Lax, Secure in production builds
  (library default is not HttpOnly).
- **No account enumeration**: identical responses for registration and reset regardless of
  whether the email exists; generic sign-in error.
- **Tests**: RLS matrix (218), special cases (61), HTTP integration (8), unit (32), E2E (4).
- **Docs**: `docs/backend/AUTHENTICATION.md`; updates to `ARCHITECTURE.md`, `ENVIRONMENT.md`.

### Files created or modified

- Created: `supabase/migrations/20261024180000_authorization.sql`,
  `supabase/tests/database/006_rls_matrix.test.sql`, `007_rls_special_cases.test.sql`,
  `supabase/templates/confirmation.html`, `recovery.html`,
  `src/middleware.ts`, `src/lib/safe-redirect.ts`, `src/lib/supabase/{env,middleware}.ts`,
  `src/server/core/{auth.ts,supabase/server.ts}`, `src/server/auth/{actions,errors}.ts`,
  `src/shared/contracts/auth.ts`, `src/features/auth/*` (6 files),
  `src/app/(app)/layout.tsx`, `src/app/(auth)/{layout,login/page,register/page,forgot-password/page}.tsx`,
  `src/app/reset-password/page.tsx`, `src/app/auth/confirm/route.ts`,
  `vitest.config.ts`, `playwright.config.ts`, `tests/{setup-env.ts,stubs/empty.ts}`,
  `tests/unit/*` (3), `tests/integration/rls-http.test.ts`, `tests/e2e/{auth.spec.ts,mailpit.ts}`,
  `docs/backend/AUTHENTICATION.md`.
- Moved (no content change): app pages into `src/app/(app)/` (route group; URLs unchanged).
- Modified: `src/app/layout.tsx`, `src/components/layout/{app-shell,app-header}.tsx`,
  `supabase/config.toml`, `supabase/tests/database/001_schema.test.sql`, `package.json`
  (deps: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `server-only`; dev: `vitest`,
  `@playwright/test@1.56.1`, `@types/node@^22`; test scripts), `.gitignore`, docs.

### Database migrations

| Migration | Applied locally |
| --- | --- |
| `20261024180000_authorization` | ✅ |

### Tests executed and results

| Suite | Command | Result |
| --- | --- | --- |
| Database (7 files) | `npm run test:db` | ✅ 376/376 |
| Unit | `npm run test:unit` | ✅ 32/32 |
| HTTP integration | `npm run test:integration` | ✅ 8/8 (fails loudly if Supabase is not configured) |
| End-to-end | `npm run test:e2e` | ✅ 4/4 |
| Lint / types / build | `npm run lint`, `npx tsc --noEmit`, `npm run build` | ✅ |

Issues found and fixed during the phase:

1. Supabase default grants gave `authenticated` `TRUNCATE` (bypasses RLS) → replaced with explicit grants.
2. `@supabase/ssr` cookies are not HttpOnly by default → explicit cookie options + E2E assertion.
3. Vitest silently skipped integration tests because Next's env loader ignores `.env.local`
   under `NODE_ENV=test` → explicit loading and a hard failure when unconfigured.
4. Middleware guest redirect could encode a query string into the path → builds a full URL.

### Outstanding issues

- Domain data in the UI is still mock data (Phase 7); the overview greeting still shows the
  sample name, while the header shows the real user.
- Invitation token generation, invite UI and emails: Phase 6. Ownership transfer function: Phase 6.
- No `supabase/seed.sql` demo data yet; tests create their own fixtures. Will add with
  frontend integration (Phase 7) if useful for local demos.
- Hosted Auth configuration (Site URL, templates, SMTP — D9) is documented but not applied
  (no hosted projects; requires approval).
- Pre-existing `npm audit` finding in Next.js' bundled `postcss`.

### Architectural decisions

- Email links use `verifyOtp` with `token_hash` (cross-device), not PKCE code exchange.
- Auth runs server-side only; session cookies HttpOnly. A future browser Realtime client
  will need a server-issued access token.
- Members are added only through invitation acceptance; owners can change roles except to owner.
- Recording status transitions and deletion are server-only (service role, Phase 5).

### Next recommended action

Phase 4 — Backend application services: Route Handlers under `/api/v1` for companies,
recruiters, opportunities (incl. stage changes), recruiter calls (transactional composite
create/update), interviews, preparation tasks, questions and follow-ups, with shared zod
contracts, consistent errors, pagination/filtering, and `docs/backend/API.md`.

---

## Phase 4 — Backend Application Services

**Status:** Complete (2026-10-24). Gate "core CRUD operations work": ✅
(pgTAP 402/402, Vitest 73/73, Playwright 32/32 — 28 API + 4 browser).

### Completed tasks

- **Transactional DB functions** (`20261024190000_application_services.sql`):
  `save_opportunity` and `save_recruiter_call` (SECURITY INVOKER, one transaction) with
  find-or-create company, inline recruiter create/update, partial updates via
  `jsonb_populate_record`, call follow-up upsert/removal preserving completion.
- **REST API** under `/api/v1` (22 route files): `me`, workspaces (list/create/get/rename/
  delete with name confirmation), companies, recruiters, opportunities (+ `PUT …/stage`),
  recruiter calls (composite create/update, summaries vs detail), interviews, preparation
  tasks, questions, STAR stories, follow-ups (upcoming/overdue relative to the caller's date).
- **Shared pipeline** (`withApi`): request id, Origin check + JSON-only mutations, 1 MB body
  limit, verified user (JSON 401), workspace role check (404 non-member / 403 role), zod
  validation with field details, database-error mapping without leaking internals,
  `Cache-Control: no-store`, structured error logs without bodies.
- **Shared contracts** (`src/shared/contracts/*`): zod schemas + TypeScript types used by
  server and (in Phase 7) client.
- **Pagination/filtering/sorting** on every collection; safe search (LIKE wildcard escaping,
  quoted `or()` values).
- **Generated DB types** (`npm run db:types`).
- **Docs**: `docs/backend/API.md`; updated `DATABASE.md` (Phase 3 + 4 content was missing),
  `ARCHITECTURE.md`, `ENVIRONMENT.md`.

### Files created or modified

- Created: `supabase/migrations/20261024190000_application_services.sql`,
  `20261024191000_workspace_insert_id.sql`, `supabase/tests/database/008_services.test.sql`,
  `src/server/core/{api,crud,errors,pagination,search,rows,database.types}.ts`,
  `src/server/recruitment/{companies,recruiters,opportunities,calls,payloads}.ts`,
  `src/server/interviews/interviews.ts`, `src/server/preparation/{tasks,questions,star-stories}.ts`,
  `src/server/followups/follow-ups.ts`, `src/server/workspaces/workspaces.ts`,
  `src/shared/contracts/{common,workspaces,companies,recruiters,opportunities,calls,interviews,preparation,follow-ups}.ts`,
  `src/app/api/v1/**/route.ts` (22), `tests/api/{helpers,access,workspaces,recruitment,calls,interview-intelligence}.spec.ts`,
  `tests/unit/{api-core,contracts}.test.ts`, `docs/backend/API.md`.
- Modified: `src/lib/supabase/middleware.ts` (API routes are never redirected),
  `src/server/core/supabase/server.ts` (typed client), `playwright.config.ts` (api + chromium
  projects, loads `.env.local`), `package.json` (scripts `db:types`, `test:api`), docs.

### Database migrations

| Migration | Applied locally |
| --- | --- |
| `20261024190000_application_services` | ✅ |
| `20261024191000_workspace_insert_id` | ✅ |

### Tests executed and results

| Suite | Result |
| --- | --- |
| `npm run test:db` (8 files) | ✅ 402/402 (new: 26 service-function assertions) |
| `npm run test` (unit + HTTP integration) | ✅ 73/73 (new: 33 unit) |
| `npx playwright test` (api + chromium) | ✅ 32/32 (new: 28 API) |
| `npm run lint`, `npx tsc --noEmit`, `npm run build` | ✅ |
| Secret scan (client bundle, repo files) | ✅ 0 matches |

Defects found by the tests and fixed:

1. Supabase query builders are thenables; returning one from an async filter executed it
   early (`range is not a function`) → split async `resolveList` from synchronous `applyList`.
2. `INSERT … RETURNING` on workspaces failed the SELECT policy (owner membership is added by
   an AFTER trigger) → server-generated id + read-back; migration grants `insert (id)`.
3. PostgREST returns the call follow-up as an array (composite FK vs single-column unique
   index) → mapper accepts both shapes.
4. `NO ACTION` FK violations put "still referenced" in `details`, not `message` → in-use
   deletes now return `409 in_use` instead of `400`.
5. Middleware redirected unauthenticated API calls to `/login` → API now answers JSON 401.

### Outstanding issues

- Pagination is offset-based (documented trade-off); switch to keyset if lists grow.
- Activity events for important changes are not written yet (Phase 6, via triggers).
- Frontend still uses mock data (Phase 7).
- Pre-existing `npm audit` finding in Next.js' bundled `postcss`.

### Architectural decisions

- REST Route Handlers for all data (D2); composite writes as SECURITY INVOKER DB functions.
- Generic `crud()` helper for simple resources; custom services for opportunities and calls.
- Calls list returns summaries (no long text); detail returns everything.
- Follow-up "overdue/upcoming" uses the client's local date (`asOf`) to avoid timezone errors.

### Next recommended action

Phase 5 — Audio recording storage: private `recordings` bucket (size/MIME limits), upload
init with signed upload URLs, completion with size + magic-byte verification, owner/editor
playback via 5-minute signed URLs, soft delete, cleanup-queue purge and abandoned-upload jobs,
retention, and `docs/backend/STORAGE.md`.

---

## Phase 5 — Recording Storage

**Status:** Complete (2026-10-24). Gate "authorized uploads and playback work": ✅
(pgTAP 449/449, Vitest 81/81, Playwright 41/41 — 37 API + 4 browser).

### Completed tasks

- **Private bucket** `recordings` created by migration: `public = false`, 100 MiB limit,
  MIME types `audio/mpeg`, `audio/mp4`, `audio/wav` only. **No `storage.objects` policies**,
  so clients (even owners with a valid session) cannot list, download, upload, overwrite or
  delete objects; access is only via server-issued signed URLs. Local global Storage limit
  raised to 100 MiB (`supabase/config.toml`).
- **Upload flow**: `POST /calls/{id}/recordings` (editor+, consent required, extension/MIME/
  size checks, server-generated path, Postgres-backed rate limit 30/h) → one-time, path-bound
  signed upload URL (2 h, no overwrite) → browser uploads directly to Storage →
  `POST /recordings/{id}/complete` verifies existence, size, content type and audio signature
  (MP3/M4A/WAV magic bytes via a ranged read) before the recording becomes `uploaded`;
  invalid files are removed and the recording marked `failed` (`422`).
- **Interrupted/failed uploads**: `409 upload_incomplete`, `POST /recordings/{id}/upload-url`
  renewal, idempotent `complete`, quota released on failures; abandoned uploads (> 24 h)
  failed and purged by the maintenance job.
- **Playback**: `GET /recordings/{id}/playback-url` for owner/editor only (D4), uploaded
  recordings only, 5-minute signed URL, `Cache-Control: no-store`, 120/h rate limit.
- **Deletion**: owner or the uploading editor; soft delete + cleanup queue in one
  transaction, immediate object removal with queue fallback; tombstones purged after 30 days.
- **Limits** (configurable): 100 MiB/file (`NEXT_PUBLIC_MAX_RECORDING_SIZE_MB` can lower it;
  DB + bucket cap), 2 GiB/workspace (`storage_quota_bytes`), 10 recordings/call — quota and
  count enforced by a DB trigger for every insert path, serialized per workspace.
- **Retention**: `delete_after` from the workspace setting (30/90/180/365 days or keep);
  changing the setting re-applies to existing recordings; due recordings deleted by the job.
- **Maintenance job** `POST /api/internal/jobs/recording-maintenance` (Bearer `CRON_SECRET`,
  constant-time compare, disabled when unset): abandoned uploads, retention, orphan
  reconciliation (objects without a live recording), tombstone/queue/counter purge, then
  queue draining with `FOR UPDATE SKIP LOCKED` claims and retries.
- **Status guard** trigger (no backwards transitions), service-only transition functions,
  `RecordingStorage` interface (Supabase implementation; replaceable), server-only admin client.
- `recordingCount` on calls now counts uploaded recordings only (computed field).
- **Docs**: created `docs/backend/STORAGE.md`; updated `API.md` (§7.1, error codes),
  `DATABASE.md`, `AUTHENTICATION.md`, `ENVIRONMENT.md` (`CRON_SECRET`), `ARCHITECTURE.md`.

### Files created or modified

- Created: `supabase/migrations/20261024200000_recording_storage.sql`,
  `supabase/tests/database/009_recording_storage.test.sql`,
  `src/server/core/{rate-limit.ts,supabase/admin.ts}`,
  `src/server/recordings/{config,formats,storage,recordings,maintenance}.ts`,
  `src/shared/contracts/recordings.ts`,
  `src/app/api/v1/workspaces/[workspaceId]/calls/[id]/recordings/route.ts`,
  `src/app/api/v1/workspaces/[workspaceId]/recordings/[id]/{route,upload-url/route,complete/route,playback-url/route}.ts`,
  `src/app/api/internal/jobs/recording-maintenance/route.ts`,
  `tests/api/recordings.spec.ts`, `tests/unit/recordings.test.ts`, `docs/backend/STORAGE.md`.
- Modified: `supabase/config.toml` (100 MiB), `src/server/recruitment/calls.ts`
  (uploaded-only count), `src/shared/contracts/common.ts` (error codes),
  `src/server/core/database.types.ts` (regenerated), `scripts/write-local-env.mjs`
  (generates `CRON_SECRET`), `.env.example`, `tests/api/helpers.ts`,
  `supabase/tests/database/{001_schema,006_rls_matrix}.test.sql` (new table), docs.

### Database migrations

| Migration | Applied locally |
| --- | --- |
| `20261024200000_recording_storage` | ✅ |

### Tests executed and results

| Suite | Result |
| --- | --- |
| `npm run test:db` (9 files) | ✅ 449/449 (new: 46 storage assertions) |
| `npm run test` (unit + HTTP integration) | ✅ 81/81 (new: 8 unit) |
| `npx playwright test` (api + chromium) | ✅ 41/41 (new: 9 API, real uploads through signed URLs) |
| `npm run lint`, `npx tsc --noEmit`, `npm run build`, `supabase db lint` | ✅ |
| Secret scan (client bundle, repo files; secret key and cron secret) | ✅ 0 matches |

Security cases covered by tests: viewer/commenter playback and upload denied, non-member
`404`, direct Storage download/list/sign/upload/remove with a signed-in owner session denied,
public URL denied, upload token bound to its path and unable to overwrite, fake/mismatched
files rejected and removed, quota/rate limits, job secret required (user session rejected).

Defects found by the tests and fixed:

1. `rate_limit_counters` used a composite primary key, breaking the "uuid keys" schema rule
   → uuid id + unique key.
2. `app.cleanup_reason` leaked to later statements in the same transaction (queued a soft
   delete as `failed_validation`) → reset after use; `PERFORM` reset `FOUND` before the
   check → reordered.

### Outstanding issues

- No schedule exists yet for the maintenance job (Phase 9, needs approval): until then
  abandoned uploads, retention and deferred removals wait; user deletions are immediate.
- The audio check verifies the container signature, not decodability.
- Frontend still uses in-memory previews (Phase 7 wires upload/playback, consent checkbox,
  progress and retention warning).
- Hosted projects must set the global Storage limit ≥ 100 MiB.

### Architectural decisions

- Direct browser → Storage uploads with path-bound signed URLs (no audio through Next.js).
- Limits enforced in the database (trigger) so every insert path is covered.
- One combined maintenance job instead of four; rate limits in Postgres (works across instances).
- Retention changes apply to existing recordings (documented; UI warning in Phase 7).

### Next phase

Phase 6 — Collaboration — complete (see below).

---

## Phase 6 — Collaboration Backend

**Status:** Complete (2026-10-25). Gate "role-based sharing is enforced": ✅
(pgTAP 504/504, Vitest 87/87, Playwright 48/48 — 44 API + 4 browser).

### Completed tasks

- **Invite collaborators**: owner-only `POST …/invitations` with a 256-bit token (only its
  SHA-256 is stored), returned once as an invite link; duplicate/member/limit checks in a DB
  trigger; 7-day expiry; revocation; rate limits. **Email delivery not implemented** (D9 open):
  links are shared manually.
- **Accept invitations**: `POST /api/v1/invitations/preview` (workspace, role, inviter, email
  match — nothing else) and `/accept` (single use, bound to the invited email).
- **Assign roles / update permissions / remove collaborators**: members list, owner-only role
  changes (editor/commenter/viewer), removal, self-leave; owner protected. Changes take effect
  on the next request (tested).
- **Comments** on shared notes: commenter+ add, author edits, author or owner deletes (soft
  delete erases text; immutable afterwards).
- **Shared notes API** with optimistic concurrency (`version` required; stale → `409` with the
  current note). **Not** simultaneous editing — documented as deferred.
- **Track important changes**: 27 activity actions written by DB triggers (labels only — no
  notes, emails, file names, paths), actor attribution incl. service-role writes, readable
  summaries, `GET …/activity` with filters.
- **Synchronize record updates**: Supabase Realtime Broadcast from the database on private
  `workspace:<id>` topics, id-only payloads, membership-checked RLS policy on
  `realtime.messages`, no client publishing; `GET /api/v1/realtime/token` for `setAuth`.
- **Docs**: created `docs/backend/COLLABORATION.md`; updated `API.md` (§13), `DATABASE.md`,
  `AUTHENTICATION.md`, `ENVIRONMENT.md` (`APP_URL`), `ARCHITECTURE.md`.

### Files created or modified

- Created: `supabase/migrations/20261025100000_collaboration_services.sql`,
  `supabase/tests/database/010_collaboration.test.sql`,
  `src/server/collaboration/{activity,activity-summary,comments,invitations,members,notes,people,realtime}.ts`,
  `src/shared/contracts/collaboration.ts`,
  routes `src/app/api/v1/workspaces/[workspaceId]/{members,members/[id],invitations,invitations/[id],notes,notes/[id],notes/[id]/comments,comments/[id],activity}/route.ts`,
  `src/app/api/v1/{invitations/preview,invitations/accept,realtime/token}/route.ts`,
  `tests/api/collaboration.spec.ts`, `tests/unit/collaboration.test.ts`, `docs/backend/COLLABORATION.md`.
- Modified: `src/server/recordings/recordings.ts` (deletion actor), `src/server/core/database.types.ts`,
  `supabase/tests/database/{001_schema,002_identity,007_rls_special_cases}.test.sql`, `.env.example`, docs.

### Database migrations

| Migration | Applied locally |
| --- | --- |
| `20261025100000_collaboration_services` | ✅ |

### Tests executed and results

| Suite | Result |
| --- | --- |
| `npm run test:db` (10 files) | ✅ 504/504 (new: 55 collaboration assertions) |
| `npm run test` (unit + HTTP integration) | ✅ 87/87 (new: 6 unit) |
| `npx playwright test` (api + chromium) | ✅ 48/48 (new: 7 API incl. live Realtime subscriptions) |
| `npm run lint`, `npx tsc --noEmit`, `npm run build`, `supabase db lint` | ✅ |
| Secret scan (client bundle, repo files) | ✅ 0 matches |

Defects found by the tests and fixed:

1. **Existing bug (Phase 3):** `accept_invitation` compared `citext` emails inside a function
   with `search_path = ''`, where the case-insensitive operator is not resolved, so the check
   was case-sensitive (an invitation to `Dana@Example.com` could not be accepted by
   `dana@example.com`). Fixed with explicit lower-cased comparison; the same pattern in the new
   invitation trigger and preview function.
2. Test fixtures: inserts with client-supplied comment ids (not granted), deleting members
   without a workspace filter (hit the user's own personal-workspace owner row).

### Outstanding issues

- Invitation emails (D9) — links only for now.
- Ownership transfer not implemented (owner cannot leave).
- Removed members' already-open Realtime connections can receive id-only notifications until
  their next token refresh (≤ 1 h); data access is revoked immediately.
- Realtime delivery is best-effort; clients must refetch after reconnecting.
- `/invite/<token>` page and all collaboration UI are Phase 7.
- Simultaneous note editing is deferred to a future release.

### Architectural decisions

- Broadcast-from-database with id-only payloads instead of `postgres_changes` (no content
  ever pushed; no delete-event id leak; API remains the only read path).
- Activity written by triggers (covers every write path; append-only).
- D7 table list extended with `shared_notes`, `recordings`, `workspace_members`, `workspaces`.

### Next phase

Phase 7 — Frontend integration — complete (see below).

---

## Phase 7 — Frontend Integration

**Status:** Complete (2026-10-25). Gate "frontend workflows persist real data": ✅
(pgTAP 505/505, Vitest 93/93, Playwright 53/53 — 46 API + 7 browser).

### Completed tasks (in the specified integration order)

1. **Authentication** — already server-side (Phase 3); the app shell now passes the signed-in
   user to the store; 401s redirect to sign-in; sign-out no longer races background requests.
2. **Workspaces** — store loads the user's workspaces and remembers the active one per
   browser; workspace switcher (sidebar/mobile); create, rename, retention, delete in Settings.
3–9. **Companies, recruiters, opportunities, calls, recordings, interviews, questions,
   preparation tasks, STAR stories, follow-ups** — mock data removed; `AppStoreProvider` loads
   everything through `/api/v1`; every `useActions` mutation calls the API and stores the
   server's record. The call form saves call + opportunity + recruiter + follow-up in one
   request. Recordings: consent, direct-to-storage upload with progress/cancel, server
   verification, resume after interruption, signed playback with automatic URL refresh,
   delete.
10. **Collaboration** — invite by link, `/invite/<token>` accept page, member roles/removal/
    leave, shared notes with version-conflict resolution, comments (edit/delete/moderate),
    activity feed, live updates via Realtime (id-only notifications → refetch).
- **States and feedback**: loading skeleton + retry, empty states, server error messages and
  field details, read retries, success toasts, optimistic stage/task toggles with rollback.
- **Permission-aware UI** (`usePermissions`): read-only interface for viewers, comment-only
  for commenters, playback for owners/editors only, owner-only management.
- **Backend support**: `GET …/calls?view=detail`, `GET …/notes?view=detail`,
  `GET …/recordings`, `GET …/comments`; Realtime notifications for companies, recruiters,
  questions and STAR stories (migration `20261025120000_broadcast_reference_data`).
- **Docs**: created `docs/backend/FRONTEND_INTEGRATION.md`; rewrote `README.md`; updated
  `API.md`, `COLLABORATION.md`, `DATABASE.md`; `FRONTEND_PROGRESS.md` marked historical.

### Files created or modified

- Created: `src/lib/api/{client,mappers,workspace-data}.ts`, `src/lib/store/{permissions,use-realtime-sync}.ts`,
  `src/lib/hooks/use-submit.ts`, `src/lib/supabase/realtime-client.ts`, `src/components/ui/toaster.tsx`,
  `src/components/shared/form-error.tsx`, `src/components/layout/workspace-switcher.tsx`,
  `src/features/recordings/upload.ts`, `src/features/invitations/invitation-page.tsx`,
  `src/app/invite/[token]/page.tsx`, routes `…/recordings`, `…/comments`,
  `supabase/migrations/20261025120000_broadcast_reference_data.sql`,
  `tests/e2e/workflows.spec.ts`, `tests/api/frontend-support.spec.ts`, `tests/unit/mappers.test.ts`,
  `docs/backend/FRONTEND_INTEGRATION.md`.
- Modified: store (`app-store`, `reducer`, `use-actions`, `selectors`), types, every feature page
  and form that mutates data (calls, opportunities, interviews, follow-ups, preparation, questions,
  recordings, collaboration, settings, overview), layout (header, sidebar, mobile nav, data gate,
  confirm dialog), login page, calls/notes/recordings/comments services and contracts.
- Removed: `src/data/mock-data.ts`, `src/features/recordings/{local-file-registry,use-object-url}.ts`.

### Database migrations

| Migration | Applied locally |
| --- | --- |
| `20261025120000_broadcast_reference_data` | ✅ |

### Tests executed and results

| Suite | Result |
| --- | --- |
| `npm run test:db` (10 files) | ✅ 505/505 |
| `npm run test` (unit + HTTP integration) | ✅ 93/93 (new: 6 mapper tests) |
| `npx playwright test` (api + chromium) | ✅ 53/53 (new: 2 API, 3 browser workflows) |
| `npm run lint`, `npx tsc --noEmit`, `npm run build`, `supabase db lint` | ✅ |
| Secret scan (client bundle, repo files) | ✅ no key values; the only name match is supabase-js's own `sb_secret_` prefix check |

Browser workflows verified: create opportunity → change stage → log call with new recruiter
and follow-up → upload a recording (consent, server verification) → play it via a signed URL →
fake file rejected → everything persists after reload → prep task → dashboard → another account
gets "not found"; owner invites by link → invitee signs in through the link and accepts →
read-only viewer interface → owner's new note appears live → promotion to commenter → live
comment; stale note save shows the conflict prompt.

Defects found and fixed:

1. Sign-out raced a background request's 401 redirect (`/login?next=/` instead of the
   signed-out page) → 401 redirects are suppressed while signing out.
2. Checkboxes waited for the server before changing → optimistic toggles with rollback.

### Outstanding issues

- The whole workspace is loaded up front (fine for personal volumes; paginate per route if it grows).
- Recruiter call edits are last-write-wins (version checks exist for notes only).
- Realtime is best-effort; no offline queue.
- Invitation emails (D9), ownership transfer, maintenance-job scheduling (Phase 9) remain open.

### Architectural decisions

- Kept the client store and components; replaced its data source and mutations (minimal UI churn).
- Realtime notifications trigger API refetches, so the API stays the only read path.
- Optimistic updates only for instant, easily reverted interactions.

### Next phase

Phase 8 — Testing and QA — complete (see below).

---

## Phase 8 — Testing and Quality Assurance

**Status:** Complete (2026-10-25). Gate "critical security tests pass": ✅
(692 tests: pgTAP 505, Vitest 124 = 112 unit + 12 integration, Playwright 63 = 55 API + 8 browser;
lint, types, `db lint`, build, `npm audit` 0 vulnerabilities).

### Completed tasks

- **Coverage audit** against the specification; requirement → test traceability in
  `docs/backend/TESTING.md`.
- **Unit tests** (new 19): permission helpers (`src/lib/permissions.ts`, now used by the UI),
  business rules (dashboard metrics, overdue rules, follow-ups, intelligence aggregation, call
  rows, store cascades), browser API client (envelopes, retries, pagination), client
  validation and date helpers.
- **Security suite** `tests/api/security.spec.ts`: authorization matrix over all 75 workspace
  routes for anonymous (401), outsiders (404, incl. foreign ids in their own workspace), viewers
  and commenters (403 above their role, 200 reads); route-coverage guard (new routes must be
  listed); commenter upload denial; secrets absent from API responses, served pages and every
  built JS chunk; security headers.
- **Repository secret scan** `tests/integration/repository-secrets.test.ts`.
- **Specification workflow** `tests/e2e/full-workflow.spec.ts`: register (real confirmation
  email) → log in → opportunity → call → structured notes → upload → play → prep tasks → log out
  → log in → persistence → unauthorized account denied (UI and API).
- **Hardening**: security headers (Permissions-Policy disables microphone/camera, framing
  protection, partial CSP, nosniff, referrer policy, COOP, HSTS, no X-Powered-By); `postcss`
  advisory fixed via npm override (no Next.js major upgrade).
- **CI**: `.github/workflows/ci.yml` (all suites against local Supabase on a runner;
  manual trigger only — not yet executed).
- **Docs**: created `docs/backend/TESTING.md`, `docs/backend/SECURITY.md`; updated
  `README.md`, `docs/CURRENT_STATUS.md`.

### Files created or modified

- Created: `tests/unit/{permissions,business-rules,api-client,client-validation}.test.ts`,
  `tests/unit/fixtures/app-data.ts`, `tests/integration/repository-secrets.test.ts`,
  `tests/api/security.spec.ts`, `tests/e2e/full-workflow.spec.ts`, `src/lib/permissions.ts`,
  `.github/workflows/ci.yml`, `docs/backend/{TESTING,SECURITY}.md`.
- Modified: `next.config.ts` (headers), `package.json` / `package-lock.json` (postcss override),
  `src/lib/store/permissions.ts`, recording and comment UI (shared permission helpers), docs.

### Database migrations

None.

### Tests executed and results

| Suite | Result |
| --- | --- |
| `npm run test:db` | ✅ 505/505 |
| `npm test` | ✅ 124/124 (112 unit, 12 integration) |
| `npx playwright test` | ✅ 63/63 (55 API, 8 browser) |
| `npm run lint`, `npx tsc --noEmit`, `npm run build`, `supabase db lint` | ✅ |
| `npm audit` | ✅ 0 vulnerabilities |

All seven specification security requirements pass (TESTING.md §4). No application defects were
found in this phase; the new tests passed against the existing implementation after selector
fixes in the tests themselves.

### Outstanding issues

- CI workflow not executed yet (manual trigger; requires GitHub Actions).
- No load/performance tests, cross-browser runs, automated accessibility audit or coverage report.
- Script-src CSP, hosted configuration, monitoring, backups and job scheduling are Phase 9.

### Architectural decisions

- Permission rules for the UI live in one pure module mirroring the server rules.
- CI is opt-in to avoid consuming paid minutes without approval.
- Dependency advisories are fixed with targeted overrides before considering major upgrades.

### Next phase

Phase 9 — Deployment and operations — awaiting approval. Requires decisions/approval for:
hosted Supabase projects (staging, production), Vercel project, email provider (D9), domain,
and any paid plans.

