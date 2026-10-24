# Implementation Roadmap

> **Superseded (planning draft).** The current backend design is in [`docs/backend/`](./backend/ARCHITECTURE.md). This file is kept for reference until it is removed (decision D8).

Status: **Proposed** — the backend is not implemented. This backlog is ordered by
dependency. Estimates: **S** ≤ 1 day, **M** 2–3 days, **L** 4–5 days (one engineer).
Priorities: **P0** required for MVP launch, **P1** should ship with MVP if time allows,
**P2** after MVP.

## 1. Milestones

| Milestone | Goal | Exit criteria |
| --- | --- | --- |
| **M0 Foundations** | Tooling, environments, test harness | CI green with static + unit + DB jobs on an empty schema |
| **M1 Auth & workspaces** | Real users, personal workspaces, protected app | E2E-1 passes; RLS baseline tests pass |
| **M2 Core domain API** | Schema, RLS and endpoints for pipeline, calls, interviews, tasks, prep content | DB-1…DB-12 and API-1…API-13 pass for these resources |
| **M3 Frontend integration** | UI uses the API; data persists | E2E-2 (minus recording), E2E-3, E2E-6, E2E-7 pass |
| **M4 Recordings** | Private upload, playback, deletion, retention | ST-1…ST-13 and full E2E-2 pass |
| **M5 Collaboration** | Members, invitations, notes, comments, activity | E2E-4, E2E-5 pass; RLS matrix includes all roles |
| **M6 Hardening & launch** | Security, performance, operations | TEST_PLAN §4 gates, §6 targets, DEP-1…DEP-12 met; security review sign-off |

Dependency chain: `M0 → M1 → M2 → M3`, `M2 → M4` (UI part needs M3), `M1 + M3 → M5`,
all → `M6`.

```
M0 ──▶ M1 ──▶ M2 ──┬──▶ M3 ──┬──▶ M5 ──┐
                   │         │         ├──▶ M6
                   └──▶ M4 ◀─┘ ────────┘
```

## 2. Backlog

### M0 — Foundations

| ID | Item | Pri | Est | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BE-001 | Create Supabase projects (staging, prod on Pro plan) and local CLI setup (`supabase init`, `config.toml`) | P0 | S | Region decision | `supabase start` works locally; staging/prod projects exist in chosen region; access restricted to named admins |
| BE-002 | Add dependencies: `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `server-only`; dev: `vitest`, `@playwright/test`, Supabase CLI | P0 | S | — | `npm ci && npm run build` passes; no high/critical `npm audit` findings |
| BE-003 | `src/server/core`: request-scoped user client, admin client (server-only), error type → API error mapper, request ID, redacting logger, cursor pagination helper | P0 | M | BE-002 | Unit tests ≥ 80% coverage; importing the admin client from a client component fails the build |
| BE-004 | `src/shared/contracts` scaffold with zod schemas + inferred types; Route Handler wrapper (parse → auth → handler → map errors) | P0 | M | BE-003 | One sample endpoint returns contract-valid success and each error code in API_CONTRACTS §1.1 |
| BE-005 | CI workflow (TEST_PLAN §5) with static, unit, db, integration, e2e jobs | P0 | M | BE-001, BE-002 | PR checks run in < 15 min; failing test blocks merge |
| BE-006 | Port fictional mock data to `supabase/seed.sql` + TS test factories | P0 | M | BE-020, BE-023, BE-026, BE-028 (schema); TS factories can start earlier | `supabase db reset` loads seed; counts match prototype (8 calls, 6 opportunities, 18 questions) |

### M1 — Authentication and workspaces

| ID | Item | Pri | Est | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BE-010 | Migration: `profiles`, `workspaces`, `workspace_members`, helpers (`role_rank`, `has_workspace_role`, `set_updated_at`), RLS baseline (revoke anon, force RLS) | P0 | M | BE-001 | DB-1, DB-2, DB-6, DB-11 pass |
| BE-011 | `handle_new_user` trigger: profile + personal workspace + owner membership | P0 | S | BE-010 | New sign-up creates exactly 1 profile, 1 workspace, 1 owner membership (pgTAP) |
| BE-012 | Supabase Auth config: magic link + Google, redirect allow-list, SMTP, templates | P0 | S | BE-001, email provider decision | Magic link works locally (Inbucket) and on staging |
| FE-010 | Sign-in page, `/auth/callback`, sign-out, `middleware.ts` session refresh + route guard | P0 | M | BE-012 | Unauthenticated visit to `/calls` redirects to `/sign-in`; after sign-in returns to `/calls`; E2E-1 passes |
| BE-013 | `GET/PATCH /me`, `GET/POST /workspaces`, `GET/PATCH /workspaces/{ws}` | P0 | M | BE-004, BE-010 | API-1…API-5 pass for these endpoints |
| FE-011 | Workspace context in the app (active workspace from URL/selection), header avatar uses real profile | P0 | M | BE-013, FE-010 | Switching workspace reloads data for that workspace only |

### M2 — Core domain API

| ID | Item | Pri | Est | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BE-020 | Migration: companies, recruiters, opportunities (+ composite FKs, indexes, RLS) | P0 | M | BE-010 | DB-3/4/5/10 pass for these tables |
| BE-021 | Companies & recruiters endpoints | P0 | M | BE-020 | API-1…API-5; duplicate company name → `409` with existing ID |
| BE-022 | Opportunities endpoints incl. `set_opportunity_stage` RPC, `counts`, `/intel` | P0 | L | BE-021 | API-1…API-5, API-8, API-10; stage change writes one activity event |
| BE-023 | Migration: recruiter_calls, call_candidate_questions, tasks (+ RLS) | P0 | M | BE-020 | DB-3/4/10 pass for these tables |
| BE-024 | `log_recruiter_call` / `update_recruiter_call` RPCs (transactional composite writes) | P0 | L | BE-023 | DB-8 passes; API-6/API-7 pass; idempotency key returns same call on retry |
| BE-025 | Calls endpoints (list with `q`/`stage`/cursor, detail, create, update, delete) | P0 | M | BE-024 | API-1…API-7, API-10 pass |
| BE-026 | Migration + endpoints: interviews | P0 | M | BE-020 | API-1…API-5 pass; list filters `from`/`to` correct across time zones |
| BE-027 | Tasks endpoints (follow-up + preparation) | P0 | M | BE-023 | API-1…API-5 pass; one follow-up per call enforced |
| BE-028 | Migration + endpoints: star_stories, interview_questions | P0 | M | BE-020 | API-1…API-5 pass; question filters (type/topic/company/general/q) match prototype counts on seed (Terraform = 4) |
| BE-029 | Dashboard endpoint | P0 | M | BE-022, BE-025, BE-026, BE-027 | API-11 passes; p95 < 400 ms on staging seed |
| BE-030 | Search endpoint (pg_trgm) | P1 | S | BE-022, BE-025, BE-028 | "terraform" returns ≥ 4 results on seed; p95 < 300 ms |

### M3 — Frontend integration

| ID | Item | Pri | Est | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| FE-020 | API client (`src/lib/api`) using shared contracts; typed errors | P0 | M | BE-004 | All responses validated in dev builds; errors surface `code` + `message` |
| FE-021 | Replace `createMockData()` load with API loads; mock data only when `NEXT_PUBLIC_DEMO_MODE=true` | P0 | M | FE-020, M2 | Reload keeps user data; prod build contains no mock records (DEP-11) |
| FE-022 | Make `useActions` async: pending/error state per mutation, optimistic updates for toggles/stage changes with rollback | P0 | L | FE-020 | E2E-7 passes; no UI path navigates before the server returns an ID |
| FE-023 | Call form submits composite `CallInput` in one request | P0 | M | BE-025, FE-022 | E2E-3 passes; failed save keeps form values |
| FE-024 | Due dates as `YYYY-MM-DD`; IDs opaque; remove "resets on reload" copy | P0 | S | FE-021 | No timezone shift for due dates in UTC−10…UTC+14 (unit test) |
| FE-025 | Permission-aware UI from member role | P0 | M | FE-011 | Viewer sees no create/edit/delete controls on any page (E2E-4) |
| FE-026 | Commit Playwright suite to repo (replacing ad-hoc scripts) | P0 | M | FE-021 | E2E-1…E2E-3, E2E-6…E2E-9 run in CI |

### M4 — Recordings

| ID | Item | Pri | Est | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BE-040 | Bucket `recordings` (private, 100 MB, MIME allow-list) via config/migration; no storage policies | P0 | S | BE-001 | ST-1, ST-2 pass |
| BE-041 | Migration: `recording_attachments`, `storage_deletion_queue`, deletion trigger | P0 | M | BE-023 | DB-9 passes |
| BE-042 | `RecordingStorage` interface + Supabase implementation | P0 | M | BE-040 | Unit tests with a fake; integration test against local storage |
| BE-043 | Upload init / upload-url / complete (validation, quota, magic bytes, consent) | P0 | L | BE-041, BE-042 | ST-3…ST-6 pass |
| BE-044 | Playback URL endpoint (owner/editor, 5-min TTL) and delete endpoint | P0 | M | BE-043 | ST-7, ST-8 pass |
| BE-045 | Internal job routes + Supabase Cron: purge, abandoned uploads, retention, reconciliation | P0 | L | BE-041, BE-042 | ST-9…ST-12 pass; purge SLO met in staging test (15 min p99) |
| FE-040 | Recording UI: consent checkbox, upload progress, states (pending/failed/uploaded/restricted), signed-URL playback with refresh | P0 | L | BE-043, BE-044, FE-022 | E2E-2 passes end to end; replay after 6 minutes works |
| BE-046 | Workspace retention setting + recompute `delete_after` | P1 | M | BE-045 | Shortening retention shows affected count and deletes only past-due recordings |
| BE-047 | TUS resumable uploads | P2 | L | BE-043 | 100 MB upload resumes after a simulated network drop at 50% |

### M5 — Collaboration

| ID | Item | Pri | Est | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BE-050 | Members endpoints + `transfer_ownership` RPC | P1 | M | BE-013 | DB-6 passes; editor cannot change roles via API or Data API |
| BE-051 | Invitations: create (email), revoke, accept RPC, expiry job | P1 | L | BE-050, email provider | DB-7 passes; invite email delivered on staging; token stored only as hash |
| BE-052 | Migration + endpoints: shared_notes (versioned), comments, activity feed | P1 | L | BE-020 | API-9 passes; comments RLS per role passes DB-3 |
| FE-050 | Shared workspace UI wired to API (members, invites, notes, comments, activity with real identities) | P1 | L | BE-050…BE-052, FE-025 | E2E-4, E2E-5 pass; no "local only" disclaimers remain for implemented features |
| BE-053 | Real-time note co-editing (Supabase Realtime / CRDT) | P2 | L | BE-052 | Two sessions see edits within 1 s; no lost updates |

### M6 — Hardening and launch

| ID | Item | Pri | Est | Depends on | Acceptance criteria |
| --- | --- | --- | --- | --- | --- |
| BE-060 | Rate limiting (Postgres-backed) on sensitive endpoints | P0 | M | M2, M4 | API-12 passes for every limit in SEC-6 |
| BE-061 | Security headers + CSP; CSRF Origin check | P0 | M | FE-010 | DEP-9 automated check passes; ZAP baseline: 0 high findings |
| BE-062 | Account deletion (`DELETE /me`) incl. recording purge | P0 | M | BE-045 | All user rows removed; objects purged within 24 h; auth user deleted |
| BE-063 | Observability: logging, error tracking (PII-scrubbed), alerts (DEP-8) | P0 | M | M4 | Synthetic failure triggers each alert in staging |
| BE-064 | Performance pass with 5k-call seed | P0 | M | M3 | TEST_PLAN §6 targets met |
| BE-065 | Backup/restore drill + runbooks (restore, key rotation, incident response) | P0 | S | BE-001 | Restore completes within RTO 4 h on staging; runbooks reviewed |
| BE-066 | Security review against SECURITY_MODEL threat table | P0 | M | All P0 | Every threat T1–T12 has a passing verification; sign-off recorded |
| BE-067 | Data export (JSON) per workspace | P1 | M | M2 | Export contains every entity type; excludes audio and signed URLs |
| BE-068 | MFA (TOTP) | P2 | M | M1 | Users can enroll; owners can require MFA for the workspace |

## 3. Critical path

`BE-001 → BE-010 → BE-020 → BE-023 → BE-024 → BE-025 → FE-022 → FE-023 → BE-043 → FE-040 → BE-066`

Roughly 6–8 weeks for one engineer through M4, plus 2–3 weeks for M5–M6.
This is a planning estimate to be refined after M0.

## 4. Decisions needed before starting

| Decision | Needed by | Default if undecided |
| --- | --- | --- |
| Supabase region / data residency | BE-001 | Closest region to primary users |
| Auth methods | BE-012 | Magic link + Google |
| Email provider | BE-012 / BE-051 | Resend via Supabase SMTP |
| Hosting | BE-005 | Vercel |
| Recording retention default | BE-045 | Keep until deleted |
| Viewer/commenter playback | BE-044 | Not allowed |
| Max recording size | BE-040 | 100 MB |
| Collaboration in MVP or next release | M5 planning | Next release (P1) |

## 5. Out of scope for MVP

AI features (transcription, summaries, question generation) · in-app call recording ·
microservices or Kubernetes · native mobile apps · calendar/email integrations ·
billing/subscriptions · real-time co-editing (P2).

## 6. Definition of done (every backlog item)

- Code, migrations and RLS reviewed; contracts updated in `src/shared/contracts` and API_CONTRACTS.md.
- Tests listed in the acceptance criteria are automated and green in CI.
- No new high/critical dependency vulnerabilities; no secrets in code or bundle.
- Logs contain no sensitive fields (spot-checked in tests).
- Documentation updated (`FRONTEND_PROGRESS.md` / these docs) when behavior or decisions change.
