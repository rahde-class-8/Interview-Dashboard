# Backend Architecture

Status: **Proposed (planning only — nothing in this document is implemented yet)**
Scope: MVP backend for the Recruiter Call + Interview Intelligence Dashboard
Related: [DATABASE_SCHEMA](./DATABASE_SCHEMA.md) · [API_CONTRACTS](./API_CONTRACTS.md) ·
[SECURITY_MODEL](./SECURITY_MODEL.md) · [RECORDING_STORAGE](./RECORDING_STORAGE.md) ·
[TEST_PLAN](./TEST_PLAN.md) · [IMPLEMENTATION_ROADMAP](./IMPLEMENTATION_ROADMAP.md)

---

## 1. Frontend audit

Audited at commit `80960f1` (`main`). The frontend is a **functional prototype**, not a
backend-ready client. The facts below drive the backend design.

### 1.1 Completed functionality (UI level)

| Area | What exists | Backend-relevant notes |
| --- | --- | --- |
| App shell | Sidebar, mobile drawer, header, global search, avatar menu | Search is client-side over in-memory data; notifications are a placeholder |
| Overview | 4 metrics, recent calls, pipeline, prep tasks, skill frequency | Metrics come from pure selectors in `src/lib/store/selectors.ts` — the server needs the **same definitions** |
| Recruiter calls | List/search/filter, tabbed create/edit form, detail tabs, delete | One form save writes **up to 5 entities** (company, recruiter, opportunity, call, follow-up) |
| Recordings | Picker, type/size validation, player, replace/remove | Files live only in an in-memory `File` registry; metadata has `storage: "local-preview" \| "remote"` and `remoteUrl` placeholders |
| Opportunities | List/filter, create/edit dialog, stage stepper, detail with aggregated intel | Delete cascades to calls, recordings, interviews, tasks |
| Preparation | Checklist CRUD, STAR stories, notes, matched questions | STAR stories and questions are workspace-wide; notes are a field on the opportunity |
| Question bank | CRUD, filters, inline answer notes | Optional company link |
| Interviews & follow-ups | CRUD, inline status/outcome, pending/completed filters | Follow-up and preparation tasks are separate client models |
| Shared workspace | Collaborators, invite dialog, roles, notes, comments, activity | Visual only: no identity, no enforcement, no email |
| Settings | Profile placeholder, limits, reset data | Single hard-coded fictional user |

### 1.2 What the frontend does **not** have (do not assume otherwise)

- **No authentication, sessions, or route protection.** `currentUser` is mock data.
- **No server-side data access.** All 48 client components read from one React Context
  store (`useReducer`) initialized from `createMockData()` on mount. No `fetch`, no Route
  Handlers, no Server Actions, no browser storage.
- **Synchronous mutations.** The 29 operations in `src/lib/store/use-actions.ts` return IDs
  synchronously (e.g. `saveCall()` returns the new ID and the form immediately navigates).
  A network backend makes these **async and fallible**; every caller must handle pending
  and error states.
- **No permission-aware UI.** Every user sees every edit/delete control.
- **Identity by display name.** `Comment.authorName`, `ActivityEvent.actorName` and
  `SharedNote.updatedBy` are strings; `Collaborator` has no user ID.
- **Client-generated IDs** (`opp_abc12345`). Server IDs will be UUIDs; the UI treats IDs as
  opaque strings, so this is compatible.
- **Date-only values stored as timestamps.** Due dates are converted to ISO timestamps at
  local noon (`fromDateInputValue`). The backend should store them as `date`.
- **Fixed currency** (`USD`) and **client-only validation**.
- **No automated tests** in the repository (verification used ad-hoc Playwright scripts).
- **Fictional data is always loaded.** Production must not ship mock data.

### 1.3 Integration seams that help

- `useActions()` is the single mutation entry point → replace bodies with API calls.
- `AppStoreProvider` already models `loading | ready | error` → replace the mock
  initializer with API loads.
- Domain types in `src/types/index.ts` are ID-referenced (normalized), mapping closely to
  relational tables.
- `RecordingAttachment.storage/remoteUrl` anticipates remote storage.

### 1.4 Required frontend changes (summary; detailed in the roadmap)

1. Sign-in / sign-up / callback pages, session handling, protected routes (middleware).
2. Async `useActions` with pending/error state per mutation and optimistic updates where safe.
3. Replace `createMockData()` with API loads; keep mock data only behind a dev/demo flag.
4. Permission-aware rendering driven by the member's role.
5. Recording UI: consent attestation, upload progress, processing/failed/restricted states,
   playback through short-lived signed URLs.
6. Replace name strings with user IDs + joined profile display names.
7. Remove "resets on reload / local preview only" copy once persistence exists.

---

## 2. Architecture fit: Next.js + Supabase

**Verdict: good fit for the MVP, with three conditions** (listed in §2.3).

### 2.1 Why it fits

| Need | Supabase / Next.js capability |
| --- | --- |
| Relational, normalized data with clear ownership | Managed PostgreSQL; the frontend model already maps to tables |
| Workspace multi-tenancy | Postgres Row Level Security (RLS) keyed on `workspace_id` + membership |
| Auth without building it | Supabase Auth (magic link, OAuth, password), JWT sessions via `@supabase/ssr` cookies |
| Private audio files, never in Postgres | Supabase Storage private buckets, signed upload/download URLs, storage RLS |
| One deployable unit | Next.js App Router Route Handlers host the API inside the existing app |
| Scheduled cleanup | Supabase Cron (`pg_cron` + `pg_net`) calling an internal route |
| Future real-time collaboration | Supabase Realtime (post-MVP) |

### 2.2 Alternatives considered

| Option | Why not (for MVP) |
| --- | --- |
| Separate API service (NestJS/Express) + DB | Second deployable; violates "modular monolith, prefer managed" |
| Client-only supabase-js with RLS, no API layer | Multi-entity writes need transactions; harder to version contracts, validate, rate-limit, or swap providers |
| Firebase | Document model fits poorly with relational joins/aggregations |
| Self-hosted Postgres + S3 | More ops burden; Supabase gives auth + storage + RLS managed |

### 2.3 Conditions

1. **RLS is the security boundary, not the Next.js API.** Supabase exposes tables through
   its Data API to anyone holding the public anon key, so every table must have correct RLS
   even though the app goes through Route Handlers. See [SECURITY_MODEL](./SECURITY_MODEL.md).
2. **Paid plan for production.** The free tier caps uploads at 50 MB per file and pauses
   inactive projects; recordings need ≥100 MB uploads and production needs backups/PITR.
3. **Multi-entity writes run in Postgres functions** (one transaction), not as sequential
   client calls.

---

## 3. System overview

```
 Browser (Next.js client components)
   │  fetch /api/v1/...  (cookie session)          ┌──────────────────────────┐
   │  PUT signed upload URL / GET signed audio URL ─▶ Supabase Storage        │
   ▼                                                │  private bucket          │
 Next.js app (single deployable, modular monolith)  │  "recordings"            │
   ├─ middleware.ts — session refresh, route guard  └──────────▲───────────────┘
   ├─ app/api/v1/** — Route Handlers (thin)                    │ service role
   ├─ src/server/<module>/ — validation, services, repositories│ (jobs only)
   └─ app/api/internal/jobs/** — cron targets (secret) ────────┤
            │ user JWT (RLS enforced)                          │
            ▼                                                  │
   Supabase Postgres ── RLS policies, RPC functions, triggers ─┘
   Supabase Auth ── users, sessions, JWT
   Supabase Cron ── schedules internal job routes
```

### 3.1 Request flow

1. Middleware refreshes the Supabase session cookie and redirects unauthenticated users
   away from app routes.
2. A Route Handler parses input with a shared zod schema, resolves the workspace from the
   path, and calls a module service.
3. The service uses a **request-scoped Supabase client carrying the user's JWT**, so RLS
   applies to every query. Composite writes call an RPC function.
4. Responses are mapped to the API contract (camelCase), never raw rows.

### 3.2 Use of the service-role key

Only in `src/server/admin/` code paths that cannot run as the user: scheduled jobs
(storage purge, abandoned-upload cleanup, retention), recording verification reads, and
account deletion. Imported with `server-only`, never exposed to the client, and every call
site re-checks authorization explicitly.

---

## 4. Modular monolith layout

```
src/
├── app/
│   ├── (auth)/sign-in, auth/callback        # new
│   ├── api/v1/workspaces/[workspaceId]/...  # Route Handlers (thin)
│   └── api/internal/jobs/...                # cron targets
├── server/                                  # server-only code
│   ├── core/        # supabase clients, auth context, errors, pagination, logging
│   ├── workspaces/  # workspaces, members, invitations
│   ├── pipeline/    # companies, recruiters, opportunities
│   ├── calls/       # recruiter calls, candidate questions
│   ├── recordings/  # upload init/complete, playback, deletion, retention
│   ├── interviews/
│   ├── tasks/       # follow-up + preparation tasks
│   ├── prep/        # STAR stories, question bank
│   ├── collaboration/ # notes, comments, activity
│   └── admin/       # service-role operations (jobs)
├── shared/contracts/  # zod schemas + inferred types shared by client and server
└── features/ ...      # existing UI modules
supabase/
├── migrations/       # SQL migrations (schema, RLS, functions)
├── seed.sql          # fictional dev data
└── tests/            # pgTAP RLS/constraint tests
```

**Module rules**

- Each module owns its tables, schemas, service and repository. Other modules call its
  service API, not its tables (except read-only joins for listing).
- Route Handlers contain no business logic: parse → authorize → call service → map.
- Contracts in `src/shared/contracts` are the single source of truth for request/response
  shapes; the client store imports the same types.
- No module may import from `features/` (UI) or vice versa except `shared/contracts`.

---

## 5. Key decisions (ADR summary)

| # | Decision | Rationale | Revisit when |
| --- | --- | --- | --- |
| 1 | Modular monolith in the existing Next.js app | One deploy, shared types, small team | Independent scaling needs appear |
| 2 | REST JSON under `/api/v1` via Route Handlers | Explicit, testable, versionable contracts | Mobile/third-party clients need GraphQL |
| 3 | User-JWT Supabase client per request; RLS on every table | Defense in depth; Data API is publicly reachable | — |
| 4 | Composite writes as `SECURITY INVOKER` Postgres functions | Atomic transactions under RLS | — |
| 5 | Single `tasks` table (`kind = follow_up \| preparation`) | One lifecycle, one API; UI keeps two views | Kinds diverge significantly |
| 6 | Private bucket + server-issued signed upload URLs; short-lived signed playback URLs | Server controls paths and validation; no public objects | Need resumable uploads → TUS (roadmap P2) |
| 7 | Recordings readable by owner/editor only by default | Third-party voice data; least privilege | Product decides to share with viewers |
| 8 | Text + `CHECK` constraints instead of Postgres enums | Easier to evolve values | — |
| 9 | Keep React Context store; no TanStack Query in MVP | Respect existing "no extra state library" rule | Caching/pagination complexity grows |
| 10 | No AI, no in-app recording, no microservices/Kubernetes | Explicit constraints | — |

---

## 6. Technical risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| RLS policy mistake exposes another workspace's data | Critical | pgTAP role×table test matrix in CI; composite FKs; review checklist |
| Sync→async refactor of 29 mutations introduces UI bugs | High | Migrate module by module; contract tests; keep Playwright E2E green |
| Large uploads fail on mobile networks | Medium | 100 MB cap, clear retry UX; TUS resumable uploads as follow-up |
| Signed URL leakage (logs, screenshots, sharing) | Medium | 5-minute TTL, never logged/persisted, regenerated per play |
| Storage egress cost from audio streaming | Medium | Short TTL, no autoplay/preload of full files (`preload="metadata"`), quotas |
| Supabase vendor lock-in | Medium | Plain SQL migrations, Postgres-native RLS, storage behind a `RecordingStorage` interface |
| Orphaned storage objects after DB deletes | Medium | Deletion queue + scheduled purge job with metrics |
| Free-tier limits (50 MB files, project pause) | High for prod | Pro plan for staging/prod |
| Recording consent laws vary by jurisdiction | Legal | Upload attestation, retention/deletion controls, ToS (product/legal) |
| Time-zone bugs for due dates | Low | `date` columns for due dates; `timestamptz` elsewhere; ISO in API |

## 7. Implementation dependencies

- Supabase organization + projects (local via CLI/Docker, staging, production), Pro plan for prod.
- Hosting for Next.js (Vercel assumed; any Node 20 host works).
- Transactional email provider for invitations (e.g. Resend/Postmark via Supabase SMTP) — **decision needed**.
- New npm dependencies (planned): `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `server-only`;
  dev: `vitest`, `@playwright/test`, Supabase CLI.
- Product decisions: see open questions below.

## 8. Open questions for the product owner

1. Default recording retention: keep until deleted (proposed) or auto-delete after N days?
2. May commenters/viewers play recordings? (Proposed: no; owner/editor only.)
3. Maximum recording size: 100 MB (proposed) or larger?
4. Sign-in methods for MVP: magic link + Google (proposed)?
5. Data residency region for the Supabase project?
6. Email provider for invitations?
7. Are collaboration features (invites, comments) required at MVP launch or the following release? (Roadmap places them in M5.)
