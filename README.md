# Recruiter Call + Interview Intelligence Dashboard

Helps job seekers organize recruiter phone-call notes, store recordings made with
other apps, track opportunities through a hiring pipeline, prepare for
interviews, and share a workspace with collaborators.

> **Status:** full-stack MVP running locally (Next.js + Supabase). Data, files,
> sign-in and sharing are real; nothing is deployed yet (Phase 9). The app never
> records calls or uses the microphone, and has no AI features. See
> [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) for what it can and can't do today,
> and [BACKEND_PROGRESS.md](BACKEND_PROGRESS.md) for phase-by-phase progress.

## Technology stack

- [Next.js 15](https://nextjs.org) (App Router) + React 19, TypeScript (strict)
- Tailwind CSS v4, shadcn/ui components (Radix primitives), Lucide icons
- [Supabase](https://supabase.com): Postgres (RLS), Auth, private Storage, Realtime
- REST Route Handlers under `/api/v1` (zod-validated); Server Actions for auth forms
- Tests: pgTAP, Vitest, Playwright (API + browser)

## Getting started

Requirements: Node.js 20+, npm, Docker (for local Supabase).

```bash
npm install
npm run supabase:start   # local Postgres, Auth, Storage, Realtime, Mailpit
npm run env:local        # writes .env.local from `supabase status` (never commit it)
npm run dev              # http://localhost:3000
```

Register at `/register`; confirmation emails arrive in Mailpit at
http://127.0.0.1:54324. Full setup and troubleshooting:
[docs/backend/ENVIRONMENT.md](docs/backend/ENVIRONMENT.md).

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run lint`, `npx tsc --noEmit` | ESLint, type check |
| `npm run test:db` | pgTAP database and RLS tests |
| `npm test` | Vitest unit + HTTP integration tests |
| `npx playwright test` | API (`tests/api`) and browser (`tests/e2e`) tests |
| `npm audit` | Dependency vulnerabilities (0 at last check) |

Test strategy, requirement traceability and results: [docs/backend/TESTING.md](docs/backend/TESTING.md).
Security model: [docs/backend/SECURITY.md](docs/backend/SECURITY.md).
| `npm run db:reset` / `db:types` | Rebuild local DB (discards data) / regenerate types |

## Application structure

```
src/
├── app/                  # Routes; (app) = signed-in shell, (auth) = sign-in pages,
│   ├── api/v1/           #   REST API, api/internal/jobs = scheduled jobs
│   └── invite/[token]/   #   invitation acceptance
├── components/           # layout/, shared/ (Field, EmptyState, FormError…), ui/ (shadcn)
├── features/             # Feature pages and UI (calls, recordings, opportunities, …)
├── lib/
│   ├── api/              # Browser API client (retries, errors), DTO → UI mappers, workspace loader
│   ├── store/            # Workspace store, useActions (API mutations), permissions, Realtime sync
│   └── hooks/            # useSubmit / useMutation (pending, errors, toasts)
├── server/               # Server-only services (RLS-bound user client; admin client for Storage)
├── shared/contracts/     # zod schemas + types shared by API and UI
└── types/                # UI domain models
supabase/                 # migrations, pgTAP tests, config, email templates
docs/backend/             # architecture, database, auth, API, storage, collaboration, frontend,
                          #   testing, security
```

How the UI talks to the backend: [docs/backend/FRONTEND_INTEGRATION.md](docs/backend/FRONTEND_INTEGRATION.md).

## Features

- **Accounts and workspaces**: email/password sign-up with confirmation, password reset,
  a personal workspace per user, extra workspaces, a workspace switcher.
- **Recruiter calls**: one form saves the call, its opportunity, recruiter and follow-up
  together; search, filters, detail and edit views.
- **Recordings**: upload existing MP3/M4A/WAV files (consent required) straight to private
  storage with progress, server-side verification, resumable after interruptions; playback
  through 5-minute links for owners and editors; retention settings.
- **Opportunities**, **interviews & follow-ups**, **interview preparation** (tasks, STAR
  stories, notes), **question bank**, **overview dashboard** computed from stored data.
- **Collaboration**: invite by link (owner), Viewer / Commenter / Editor roles, member
  management, shared notes with version-conflict protection, comments, activity log,
  live updates via Supabase Realtime. Permission-aware interface; every rule is also
  enforced by the API and database.

## Known limitations

- Not deployed; staging/production configuration is Phase 9.
- Invitation emails are not sent yet (email provider decision D9): owners share the link.
- Shared notes are protected against overwrites but are **not** edited simultaneously
  (no live co-editing engine).
- The recording maintenance job (abandoned uploads, retention) has no schedule yet.
- Recruiter call edits use last-write-wins (only notes have version checks).
- Light mode only.
- Notes and recordings are personal data; encryption at rest relies on the hosting
  provider, and data export is not implemented yet.
