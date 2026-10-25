# Frontend Integration

How the Next.js UI uses the backend (Phase 7). The UI kept its pages, components,
styling and client store; mock data was replaced by the REST API, and Realtime keeps
the store in sync. Related: [API.md](API.md), [STORAGE.md](STORAGE.md),
[COLLABORATION.md](COLLABORATION.md).

## 1. Data flow

```
 Page components ── read ──▶ AppStore (useReducer, src/lib/store/app-store.tsx)
       │                         ▲            ▲
       │ useActions()            │ dispatch   │ refreshRecord()
       ▼                         │            │
 src/lib/api/client.ts ──▶ /api/v1 (Route Handlers, RLS) ──▶ Postgres / Storage
                                              │
 useRealtimeSync ◀── private channel workspace:<id> ◀── DB triggers (id-only payloads)
```

* **Loading.** `AppStoreProvider` loads `/workspaces` and `/me`, picks the active
  workspace (remembered per browser in `localStorage`, falling back to the user's own
  workspace), then loads every collection in parallel (`listAll`, 200 per page). `DataGate`
  shows a skeleton while loading and an error with **Try again** if loading fails.
* **Mutations.** `useActions()` (`src/lib/store/use-actions.ts`) calls the API first and
  dispatches the record the server returns, so the store always holds server data.
  Composite writes (a call with a new opportunity and recruiter) re-read the related
  records afterwards.
* **Optimistic updates** only where instant feedback matters and rollback is simple: stage
  changes and task/follow-up checkboxes. They revert and show an error toast if the
  request fails.
* **Sync.** `useRealtimeSync` joins the workspace's private Realtime channel with a
  short-lived token from `/api/v1/realtime/token`. Notifications say which row changed;
  the store re-reads it through the API (so RLS applies), batching bursts for 250 ms. After a
  dropped connection it reconnects with backoff and quietly reloads everything, since
  missed messages are not replayed. If the user's role changes or they are removed, the
  workspace list is re-read and the UI switches workspace when access is gone.

## 2. Mapping

`src/lib/api/mappers.ts` converts API contracts (`src/shared/contracts`) into the UI
models (`src/types`). Notable rules:

| API | UI |
| --- | --- |
| Calendar dates `YYYY-MM-DD` (follow-ups, prep tasks) | local-noon ISO timestamps (avoids day shifts); written back as `YYYY-MM-DD` |
| `null` text fields | `""` / `undefined` |
| Opportunity/call `recruiter: null` | `recruiterId: undefined` (“No recruiter”) |
| Members + invitations | one `collaborators` list (`kind: member \| invitation`) |
| Deleted comments | placeholders (`deleted: true`) |
| Activity | server-built `summary` sentence |

## 3. User feedback

| Concern | Implementation |
| --- | --- |
| Loading states | `DataGate` skeleton; buttons show “Saving…”, “Adding…”, “Joining…”; upload progress bar |
| Empty states | `EmptyState` on every list; role-aware text (e.g. no “Log a call” for viewers) |
| Error messages | Server messages and field details in `FormError` / field errors; never raw internals |
| Form validation | Client checks for instant feedback; the API re-validates everything (zod + database) |
| Retry | Reads retry automatically (3 attempts on network errors and 502/503/504); forms keep input so the user can resubmit; uploads have **Retry** / **Resume**; data loading has **Try again** |
| Success notifications | Toasts (`src/components/ui/toaster.tsx`, `aria-live`) for saves, deletes, uploads, invitations |
| Session expiry | A 401 from the API redirects to `/login?next=…` (suppressed while signing out) |

## 4. Permission-aware interface

`usePermissions()` (`src/lib/store/permissions.ts`) exposes `canEdit` (editor+),
`canComment` (commenter+), `canPlayRecordings` (owner/editor, D4) and `isOwner`.

| Role | Interface |
| --- | --- |
| Viewer | Read-only: no create/edit/delete controls, disabled checkboxes and stage controls, read-only notes, no playback |
| Commenter | Viewer + add/edit/delete own comments |
| Editor | Everything except workspace settings, members and invitations; can delete own recordings |
| Owner | Everything; invite, change roles, remove members, retention, delete workspace |

Hiding controls is a convenience only: the API and RLS enforce the same rules, and the API
tests prove it independently (`tests/api/*.spec.ts`).

## 5. Feature notes

* **Recruiter call form**: one request (`POST/PATCH /calls`) creates or updates the call,
  its opportunity (existing or new; company matched by name), recruiter (existing, new or
  none) and follow-up, atomically. The edit form is keyed by call id so background refreshes
  don't reset it; concurrent call edits are last-write-wins.
* **Recordings** (`src/features/recordings`): consent checkbox (required) → start upload →
  `XMLHttpRequest` PUT straight to Storage with progress and cancel → complete (server
  verification). Interrupted uploads can be resumed by re-selecting the same file;
  rejected files show the server's reason. Playback loads a 5-minute signed URL on demand
  and `AudioPlayer` refreshes it if it expires mid-playback, resuming at the same position.
* **Shared notes**: saves send the base version; on `409` the editor shows the other
  person's version with **Discard mine, load theirs** / **Save mine over theirs**. If a
  collaborator saves while the note is open and untouched, it updates in place; if the user
  has unsaved edits, a banner offers **Load latest**. This is not simultaneous editing.
* **Invitations**: the owner gets a one-time link to share (no email yet, D9).
  `/invite/<token>` (sign-in required; the login page explains what to do) previews the
  invitation and accepts it, then opens that workspace.
* **Settings**: profile, workspace name and recording retention (with a warning that a
  shorter period also deletes older recordings), create workspace, delete workspace (name
  confirmation).

## 6. Tests

| Suite | Covers |
| --- | --- |
| `tests/e2e/workflows.spec.ts` | Opportunity → stage change → call with new recruiter and follow-up → recording upload, server verification and signed playback → rejected fake file → reload persistence → prep task → dashboard → another account cannot see it; invite by link, read-only viewer UI, live note sync, promotion to commenter, live comment; stale note save conflict |
| `tests/e2e/auth.spec.ts` | Registration, confirmation, sign-in/out, password reset |
| `tests/unit/mappers.test.ts` | DTO → UI mapping rules |
| `tests/api/*.spec.ts` | Every endpoint the UI uses, including authorization |

## 7. Limitations

* The whole workspace loads up front (fine for personal job-search volumes; switch to
  route-level, paginated loading if workspaces grow large).
* Realtime delivery is best-effort; a reload always shows the latest data.
* No offline support; failed writes are not queued.
* Global search and dashboard work on the loaded workspace only.
