# Test and Deployment Plan

> **Superseded (planning draft).** The current backend design is in [`docs/backend/`](./backend/ARCHITECTURE.md). This file is kept for reference until it is removed (decision D8).

Status: **Proposed**
Covers testing strategy, required suites, acceptance gates, CI pipeline, environments and
deployment requirements for the backend MVP.

## 1. Current baseline

The repository has **no automated tests**. Frontend behavior was verified with ad-hoc
Playwright scripts (recorded in `FRONTEND_PROGRESS.md`). The first backend milestone adds
the test infrastructure before any feature work.

## 2. Test pyramid and tools

| Level | Tooling | Runs against | Scope |
| --- | --- | --- | --- |
| Static | ESLint, `tsc --noEmit`, SQL lint (`supabase db lint`) | Source | Every commit |
| Unit | Vitest | Pure TS | zod contracts, mappers (row ↔ API), selectors/metric logic, magic-byte detection, rate limiter, error mapping |
| Database | pgTAP via `supabase test db` | Local Supabase (Docker) | Constraints, RLS matrix, RPC functions, triggers |
| Integration (API) | Vitest + real HTTP to Route Handlers | Local Supabase + `next start` | Contracts, auth, authorization, transactions, error codes |
| Storage | Vitest | Local Supabase Storage | Upload/verify/playback/delete/purge flows |
| End-to-end | `@playwright/test` (Chromium; WebKit smoke) | Built app + local Supabase (CI), staging (pre-release) | Critical user journeys, accessibility (axe) |
| Security | Custom IDOR suite, header checks, bundle secret scan, OWASP ZAP baseline (staging) | Local/staging | Threats T1–T12 in SECURITY_MODEL |
| Performance | k6 (or autocannon) | Staging with seeded data | Latency budgets (§6) |

Test data is always **fictional** (ported from `src/data/mock-data.ts` into `supabase/seed.sql`
plus per-test factories). No production data in any non-production environment.

## 3. Required suites

### 3.1 Database (pgTAP)

| ID | Test | Pass criteria |
| --- | --- | --- |
| DB-1 | Every table in `public` has RLS enabled and forced | Query over `pg_class` returns 0 tables without RLS |
| DB-2 | `anon` has no privileges on `public` tables | 0 rows in `information_schema.role_table_grants` for `anon` |
| DB-3 | **RLS matrix**: for each domain table × role (owner, editor, commenter, viewer, non-member, anon) × operation (select/insert/update/delete) | Outcome equals SECURITY_MODEL §4 table for 100% of cells |
| DB-4 | Cross-workspace FK: insert child referencing parent in another workspace | Rejected by composite FK |
| DB-5 | Update moving a row to another workspace | Rejected by `WITH CHECK` |
| DB-6 | Single-owner invariant (`workspace_one_owner`), owner cannot be removed | Violations raise errors |
| DB-7 | `accept_invitation`: valid, expired, revoked, reused, wrong email | Only valid succeeds; membership created once |
| DB-8 | `log_recruiter_call` rolls back fully when any part fails | No partial company/recruiter/opportunity rows |
| DB-9 | Deleting call/opportunity/workspace enqueues every recording path | Queue count == recording count |
| DB-10 | Check constraints (comp range, interest 1–10, duration 1–600, task kind rules) | Invalid inserts fail |
| DB-11 | `SECURITY DEFINER` functions have `search_path=''` and no `EXECUTE` for `anon` | Catalog query returns 0 offenders |
| DB-12 | Activity events are append-only for `authenticated` | Update/delete denied |

### 3.2 API integration

| ID | Test | Pass criteria |
| --- | --- | --- |
| API-1 | Every endpoint without a session | `401 unauthenticated` |
| API-2 | Every workspace endpoint with a non-member session | `404 not_found` (never `403`, never data) |
| API-3 | Role enforcement per endpoint (API_CONTRACTS role column) | Below-role → `403`; at-role → success |
| API-4 | Contract conformance: responses parse with the shared zod schemas | 100% of endpoint tests validate responses |
| API-5 | Validation: missing/oversized/invalid fields | `400 validation_failed` with `details[].path` |
| API-6 | Composite call create (new opportunity + new recruiter + follow-up) | One request creates all; `created` IDs returned; idempotent with same key |
| API-7 | Call edit replaces candidate questions and removes follow-up when `followUp: null` | Matches DB state |
| API-8 | Opportunity delete cascade counts | Response counts equal removed rows |
| API-9 | Notes optimistic concurrency | Stale `version` → `409 version_conflict` |
| API-10 | Pagination: stable ordering, no duplicates/gaps across 3 pages of seeded data | Union equals full set |
| API-11 | Dashboard metrics on seed data | `8 / 5 / 3 / 6 / 1` (calls / active / upcoming / pending / overdue at a fixed clock) — same as the prototype |
| API-12 | Rate limits | Exceeding returns `429` with `Retry-After` |
| API-13 | Error responses never include stack traces, SQL, or internal IDs beyond the resource | Snapshot check |

### 3.3 Storage

| ID | Test | Pass criteria |
| --- | --- | --- |
| ST-1 | Bucket is private | `getPublicUrl` object fetch → 400/404; direct object GET without signature fails |
| ST-2 | Authenticated user cannot read/list/write the bucket with their own JWT | All denied (no storage policies) |
| ST-3 | Happy path: init → PUT → complete → playback URL → range request | `206 Partial Content`; status `uploaded` |
| ST-4 | Reject `.txt`, `.mp4` video, renamed HTML as `.mp3` | `415` at init or `422` at complete; object purged |
| ST-5 | Size: declared 10 MB, uploaded 11 MB; and > bucket limit | `422` / upload rejected |
| ST-6 | Quota exceeded | `507 quota_exceeded` |
| ST-7 | Viewer/commenter requests playback URL | `403`; editor/owner `200` |
| ST-8 | Signed URL expiry | Fetch after TTL fails |
| ST-9 | Delete → purge job | Object absent within one job run; queue row completed |
| ST-10 | Abandoned upload > 24 h | Row removed, object purged |
| ST-11 | Retention | Recording past `delete_after` deleted by job |
| ST-12 | Reconciliation detects orphan object | Orphan enqueued and purged |
| ST-13 | Logs during upload/playback contain no signed URLs or tokens | Log capture grep = 0 matches |

### 3.4 End-to-end (Playwright)

| ID | Journey | Pass criteria |
| --- | --- | --- |
| E2E-1 | Sign in (magic link via local Inbucket) → personal workspace created | Lands on Overview with empty-state dashboard |
| E2E-2 | **Core workflow:** create opportunity → log call with notes → attach recording (with consent) → play → add prep task → change stage → review dashboard | Data persists after full page reload; metrics update |
| E2E-3 | Edit call, delete call with confirmation | Changes persist; call gone after reload |
| E2E-4 | Invite collaborator → accept as second user (viewer) | Viewer sees data, no edit controls, recording shows "Restricted" |
| E2E-5 | Commenter adds comment; cannot edit opportunity | Comment visible to owner; edit controls absent |
| E2E-6 | Session expiry mid-edit | User is redirected to sign-in and unsaved changes are kept in the form (no silent loss) |
| E2E-7 | Network failure on save | Error message shown, form state preserved, retry succeeds |
| E2E-8 | Accessibility: axe on all main pages | 0 serious/critical violations |
| E2E-9 | Mobile viewport 390 px | No horizontal overflow on any route (same check as the prototype) |

## 4. Coverage and quality gates

| Gate | Threshold |
| --- | --- |
| RLS matrix (DB-3) | 100% of table × role × operation cells covered |
| Endpoint coverage | Every endpoint in API_CONTRACTS has API-1, API-2, API-3 and a happy-path test |
| Unit line coverage (`src/server`, `src/shared`) | ≥ 80% |
| E2E critical journeys | E2E-1 … E2E-5 must pass on every PR to `main` |
| Flakiness | Any test failing intermittently is fixed or quarantined within 2 working days |

## 5. CI pipeline (GitHub Actions)

```
on: pull_request, push to main
jobs:
  static:      npm ci → lint → tsc --noEmit → supabase db lint → bundle secret scan
  unit:        vitest run --coverage
  db:          supabase start → supabase db reset (migrations + seed) → supabase test db
  integration: supabase start → npm run build → next start → vitest run tests/api tests/storage
  e2e:         supabase start → build → playwright test (E2E-1…E2E-9)
  security:    npm audit --omit=dev (fail on high/critical) · gitleaks
deploy-staging (main only, after all jobs): supabase db push (staging) → deploy app → smoke E2E on staging
deploy-prod (manual approval, tagged release): supabase db push (prod) → deploy app → smoke checks
```

The bundle secret scan fails the build if `.next/static` contains the service role key
prefix or the string `SUPABASE_SERVICE_ROLE_KEY`.

## 6. Non-functional acceptance

| Area | Target (staging, seeded workspace: 5k calls, 1k opportunities) |
| --- | --- |
| List endpoints | p95 < 300 ms, p99 < 800 ms at 20 req/s |
| Dashboard | p95 < 400 ms |
| Composite call create | p95 < 500 ms |
| Playback URL issuance | p95 < 200 ms |
| Upload | 100 MB file completes on a 20 Mbps link with no server timeout (direct-to-storage) |
| Availability | 99.5% monthly (MVP) |
| Purge SLO | User-deleted objects removed within 15 min (p99) |

## 7. Environments

| Env | Supabase | App host | Data | Purpose |
| --- | --- | --- | --- | --- |
| Local | Supabase CLI (Docker) | `next dev` | `seed.sql` (fictional) | Development, unit/DB/integration tests |
| CI | Supabase CLI (Docker) in runner | `next start` | `seed.sql` + factories | Automated gates |
| Preview | Shared staging project | Per-PR preview deploy | Fictional | Review; **no recordings of real calls** |
| Staging | Dedicated project (Pro) | Staging deploy | Fictional | Release candidate, perf + ZAP |
| Production | Dedicated project (Pro, PITR) | Production deploy | Real | Live |

## 8. Deployment requirements

| ID | Requirement |
| --- | --- |
| DEP-1 | Schema changes only through versioned migrations in `supabase/migrations`, applied by CI (`supabase db push`); no manual dashboard edits in staging/prod |
| DEP-2 | Migrations are backward-compatible with the currently deployed app (expand → migrate → contract); deploy DB first, then app |
| DEP-3 | Environment variables per environment: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `CRON_SECRET`, `NEXT_PUBLIC_MAX_RECORDING_SIZE_MB`, email provider credentials; stored in the host's secret manager, never committed |
| DEP-4 | Storage bucket config (private, size limit, MIME allow-list) is declared in migrations/`config.toml` and verified by ST-1 on every deploy |
| DEP-5 | Supabase Auth config per env: site URL, redirect allow-list (exact URLs, no wildcards in prod), email templates, SMTP provider, rate limits |
| DEP-6 | Scheduled jobs registered via Supabase Cron migration: purge-storage (5 min), abandoned-uploads (hourly), retention (hourly), reconcile-storage (daily), expire-invitations (hourly) |
| DEP-7 | Production backups: daily + PITR enabled; **restore drill** on staging before launch and quarterly (RTO ≤ 4 h, RPO ≤ 15 min for DB) |
| DEP-8 | Monitoring: error tracking (PII-scrubbed), structured logs with request IDs, alerts for 5xx rate > 2% (5 min), purge queue attempts ≥ 5, orphan count > 0, job not run in 2× interval |
| DEP-9 | Security headers (SECURITY_MODEL SEC-4) verified by an automated check on staging |
| DEP-10 | Rollback: app rollback via previous deployment; DB rollback via forward-fix migration (no down migrations in prod); runbook documented |
| DEP-11 | Mock/fictional data and the demo mode flag are disabled in production builds (`NEXT_PUBLIC_DEMO_MODE` unset); a test asserts no mock IDs appear in prod API responses |
| DEP-12 | Region chosen per data-residency decision before the first production write |
