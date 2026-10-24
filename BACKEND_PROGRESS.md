# Backend Progress

Tracks the backend implementation defined in the Backend Engineering Implementation
Specification. Statuses: **Not Started / In Progress / Blocked / Complete**.

| Phase | Status | Gate |
| --- | --- | --- |
| 0 — Repository and architecture audit | **Complete — approved** (D2–D10 as recommended) | Architecture reviewed and approved |
| 1 — Development environment | **Complete (local)** · staging/production config Not Started | Local services start successfully ✅ |
| 2 — Database architecture | **Complete** | Migrations and relationship tests pass |
| 3 — Authentication and authorization | **Complete** | RLS and permission tests pass |
| 4 — Application services | Not Started | Core CRUD operations work |
| 5 — Recording storage | Not Started | Authorized uploads and playback work |
| 6 — Collaboration | Not Started | Role-based sharing is enforced |
| 7 — Frontend integration | Not Started | Frontend workflows persist real data |
| 8 — Testing and QA | Not Started | Critical security tests pass |
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
