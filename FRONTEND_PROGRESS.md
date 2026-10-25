# Frontend Progress

> **Historical record of the frontend prototype phases.** Since backend Phase 7
> (2026-10-25) the UI uses the real API: mock data, the in-memory recording registry
> and local-only collaboration described below were removed. Current state:
> [BACKEND_PROGRESS.md](BACKEND_PROGRESS.md) and
> [docs/backend/FRONTEND_INTEGRATION.md](docs/backend/FRONTEND_INTEGRATION.md).

## Phase 1 — Project Setup and Layout ✅

- Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + ESLint scaffolded.
- shadcn/ui configured (`components.json`, theme tokens in `globals.css`).
  The shadcn registry host (`ui.shadcn.com`) is blocked by this environment's
  network policy, so component sources were written into `src/components/ui`
  by hand following the standard new-york v4 implementations (Radix-based).
- App shell: sticky desktop sidebar, mobile sheet navigation, header with page
  title, global search, notifications placeholder, avatar menu and
  "New Recruiter Call" button. Skip-to-content link.
- Placeholder routes for all pages.

Verification: `tsc --noEmit` clean, `npm run lint` clean, `npm run build`
succeeded, Playwright click-through of all sidebar links + mobile menu.

## Phase 2 — Dashboard and Opportunities ✅

- TypeScript models in `src/types/index.ts` (ID-based relationships).
- Fictional, relative-date mock dataset in `src/data/mock-data.ts`.
- In-memory store (`useReducer` + Context) in `src/lib/store/`, with pure
  selectors and a `useActions` hook mirroring future API mutations.
- Overview: 4 metric cards derived from records, recent calls, pipeline by
  stage, upcoming prep tasks (checkable), frequently mentioned skills.
- Opportunities list with stage filter (URL `?stage=`), search, inline stage
  select, create dialog with validation (new company / new recruiter inline).
- Opportunity detail: clickable stage stepper, role + skills, aggregated
  recruiter intelligence, related calls, interviews, follow-ups, prep progress.

Verification: typecheck, lint, build clean. Playwright: metrics = 8 calls /
5 active / 3 upcoming / 6 pending (1 overdue), matching the mock records;
stage filter, stage change, create-opportunity validation and creation work;
active-opportunity metric updates to 6 after creation. No console errors.

## Phase 3 — Recruiter Calls and Recordings ✅

- Calls list: search (recruiter / company / job title), opportunity-status
  filter, desktop table + mobile cards, recording indicator, follow-up date
  (overdue highlighted), row actions menu, delete confirmation.
- Tabbed call form (create + edit): Contact, Job opportunity, Requirements,
  Interview intelligence, Follow-up & notes. Links to an existing opportunity
  or creates one; creates/updates recruiter; next action becomes a follow-up
  task. Error summary with links that switch tab and focus the field.
- Call detail: Overview / Interview intelligence / Recording / Notes tabs
  (deep-linkable via `?tab=`), edit mode via `?edit=1`.
- Recordings: file picker + drag-and-drop, extension/MIME validation,
  configurable size limit (`NEXT_PUBLIC_MAX_RECORDING_SIZE_MB`, default 100),
  name/size/type/duration display, status messages, custom player (play/pause,
  seek, ±15 s, speed, mute, progress), replace, remove with confirmation.
  Files live only in an in-memory registry; each player creates its own object
  URL and revokes it on replace, remove and unmount. Clear "local preview —
  not uploaded" labelling. No microphone access.

Verification: typecheck, lint, build clean. Playwright: search/filter counts,
validation summary + focus, create call (new opportunity + recruiter),
invalid type and 101 MB file rejected, WAV attached and played (position
advanced to 0:01/0:06), object URLs created=3 / revoked=3 across replace,
tab unmount and remove, edit duration, delete with confirmation. No console errors.

## Phase 4 — Interview Preparation ✅

- Preparation workspace per opportunity (`/preparation?opportunity=`): checklist
  (add / inline edit / complete / delete, progress bar), technical topics +
  required/preferred skills + matched practice questions, behavioral themes +
  STAR stories (add/edit/delete), interview notes (save/discard), and a sidebar
  with recruiter advice, hiring-manager priorities and upcoming interviews.
- Question bank: 18 sample questions (AWS, Terraform, Linux, Docker, cloud
  architecture, security, behavioral, company-specific); search (+ `?q=` from
  global search), filters by category / topic / company, inline answer notes,
  add/edit/delete.
- Interviews & follow-ups: stats, upcoming + past interviews with inline
  status/outcome selects, schedule/edit/delete dialog, follow-up list with
  pending/completed/all filter, overdue flags and inline add.

Verification: Playwright — task add/edit/complete updates progress, STAR story
added, notes saved, question filters (Terraform = 4, + Northwind = 1, "VPC" = 2,
behavioral = 4), completing the overdue follow-up and an interview update the
stats and dashboard metrics. No console errors.

## Phase 5 — Collaboration Interface ✅

- Shared workspace: collaborator list with role select and remove
  (confirmation), invite dialog (name, email, Viewer/Commenter/Editor with
  descriptions, duplicate + format validation), shared notes list/editor
  (create/edit, related opportunity), comments (add/delete own), activity
  history fed by real actions. Prominent notice that nothing is emailed,
  enforced or synchronized; pending invites are labelled "invite not sent".

Verification: Playwright — duplicate email rejected, invite added as Editor,
role changed, comment and note created, activity log updated.

## Phase 6 — Polish and Verification ✅

- Container-query layouts for interview rows / task forms inside narrow cards.
- Fixed horizontal overflow at 390 px (grids now define `grid-cols-1` base).
- Loading skeleton + error state (DataGate), empty states everywhere,
  not-found states for missing call/opportunity IDs, `not-found.tsx`, `error.tsx`.
- Settings page (profile placeholder, recording limits, appearance, reset data).
- README and `.env.example`.

Verification (final build):
- `npm run lint` — clean. `npx tsc --noEmit` — clean. `npm run build` — success.
- No horizontal overflow on any route at 390 px width.
- Keyboard: skip link first in tab order, nav reachable and activatable,
  dialogs trap focus, Escape closes and returns focus, mobile drawer closes on
  navigation, sliders respond to arrow keys.
- End-to-end workflow passed: create opportunity → log call from the
  opportunity (preselected) with notes → attach WAV → play (0:01/0:06) → add
  prep task → move stage to Technical Interview → dashboard shows 9 calls,
  6 active opportunities, new call at the top, Technical Interview count 2.

## Unfinished features / known issues

- No persistence: reload resets all data (by design for this phase).
- Sample recording attachments are metadata-only (no audio in the repo).
- shadcn/ui components were hand-written because `ui.shadcn.com` is blocked in
  this build environment; they follow the upstream implementations, and
  `components.json` is configured so `npx shadcn add` works where the registry
  is reachable.
- Dashboard "Upcoming preparation tasks" lists the 6 earliest-due tasks;
  undated tasks appear last and may not be shown.
- Dark mode tokens exist but there is no theme toggle.
- Notifications menu is a placeholder.
- No automated test suite in the repo; verification used ad-hoc Playwright
  scripts (see summary above).

## Next steps

1. Add an API layer behind `useActions` and replace mock initialization.
2. Real recording upload (signed URLs) and remote playback.
3. Authentication and server-enforced workspace roles.
4. Real-time collaborative notes.
5. Commit Playwright smoke tests (`@playwright/test`) and run them in CI.
