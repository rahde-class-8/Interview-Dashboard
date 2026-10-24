# Backend Progress

Tracks the backend implementation defined in the Backend Engineering Implementation
Specification. Statuses: **Not Started / In Progress / Blocked / Complete**.

| Phase | Status | Gate |
| --- | --- | --- |
| 0 — Repository and architecture audit | **Complete — awaiting approval** | Architecture reviewed and approved |
| 1 — Development environment | **Complete (local)** · staging/production config Not Started | Local services start successfully ✅ |
| 2 — Database architecture | Not Started | Migrations and relationship tests pass |
| 3 — Authentication and authorization | Not Started | RLS and permission tests pass |
| 4 — Application services | Not Started | Core CRUD operations work |
| 5 — Recording storage | Not Started | Authorized uploads and playback work |
| 6 — Collaboration | Not Started | Role-based sharing is enforced |
| 7 — Frontend integration | Not Started | Frontend workflows persist real data |
| 8 — Testing and QA | Not Started | Critical security tests pass |
| 9 — Deployment and operations | Not Started | Security, recovery and deployment checks pass |

---

## Phase 0 — Repository and Architecture Audit

**Status:** Complete — awaiting explicit approval before Phase 1.

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
