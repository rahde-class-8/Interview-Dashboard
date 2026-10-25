# Current Status: What the App Can and Can't Do

_Last updated: 2026-10-25, after backend Phase 8 (testing and QA)._

**Short answer:** the application works end to end, but **only on a developer machine**.
Nothing is deployed, so there is no URL to open or share yet. Everything listed under
[What it can do](#what-it-can-do) is implemented and covered by 692 automated tests (pgTAP,
Vitest, Playwright API and browser tests) running against a local Supabase stack, including
every security test required by the specification — see [backend/TESTING.md](backend/TESTING.md)
and [backend/SECURITY.md](backend/SECURITY.md).

Detailed progress per phase: [BACKEND_PROGRESS.md](../BACKEND_PROGRESS.md).

---

## How to use it today

Requirements: Node.js 20+, npm and Docker.

```bash
npm install
npm run supabase:start   # local database, auth, file storage, realtime, test mailbox
npm run env:local        # writes .env.local (never commit it)
npm run dev              # open http://localhost:3000 and register
```

* **Emails are not really sent.** Confirmation and password-reset emails are captured by a
  local test mailbox at http://127.0.0.1:54324 — open the link from there.
* **Collaborators** must be able to reach the machine running the app (e.g. the same
  network). Realistic sharing needs deployment (Phase 9).

Full setup and troubleshooting: [backend/ENVIRONMENT.md](backend/ENVIRONMENT.md).

---

## What it can do

### Accounts
* Register with email and password, confirm the email address, sign in and out, and reset a
  forgotten password.
* Each user gets a private workspace; additional workspaces can be created (for example, one
  per job search) and switched between from the sidebar.

### Recruiter calls
* Log a call with recruiter details, the role and company, compensation, requirements,
  interview stages, recruiter advice, likely technical topics, behavioural themes, red flags,
  your questions with the recruiter's answers, an interest rating and full notes.
* Saving a call creates or updates the opportunity, the recruiter and a follow-up task in the
  same step.
* Search, filter, view, edit and delete calls.

### Recordings
* Upload a recording made with another app (MP3, M4A or WAV, up to 100 MB) after confirming
  that everyone recorded consented.
* Files are stored privately and verified by the server (fake or mismatched files are
  rejected), then played back in the app.
* Interrupted uploads can be resumed.
* Optional automatic deletion after 30, 90, 180 or 365 days (see the scheduling caveat below).
* Details: [backend/STORAGE.md](backend/STORAGE.md).

### Pipeline and interview preparation
* Opportunities move through stages: New → Recruiter Screen → Technical Interview → Hiring
  Manager → Offer → Closed.
* Interviews with status and outcome; follow-up tasks with overdue flags.
* Preparation: per-opportunity checklists, STAR stories, interview notes and a question bank.
* The overview dashboard is calculated from your stored data.

### Sharing and collaboration
* Invite people by link as **viewer**, **commenter** or **editor**; change roles or remove
  people; members can leave.
* Shared notes are protected against accidental overwrites (you are asked to review a newer
  version instead of overwriting it). Notes have comments.
* An activity feed records important changes; changes made by others appear live without
  reloading.
* Permissions are enforced by the server and database, not just by hiding buttons.
* Details: [backend/COLLABORATION.md](backend/COLLABORATION.md).

---

## What it can't do yet

| Gap | What it means |
| --- | --- |
| **Not deployed** | No public URL; usable only on the machine running it. Deployment is Phase 9. |
| **No real emails** | Sign-up confirmations and password resets only reach the local test mailbox. Invitation links must be copied and sent manually. An email provider still has to be chosen (decision D9). |
| **No scheduled cleanup** | Retention auto-deletion and cleanup of abandoned uploads run only when the maintenance job is triggered manually. Normal deletions are immediate. |
| **No simultaneous editing** | Two people cannot type in the same note at the same time. The app prevents overwrites but does not merge edits. |
| **Call edits: last save wins** | If two people edit the same recruiter call at the same moment, the later save replaces the earlier one (only shared notes have version checks). |
| **No ownership transfer** | A workspace owner cannot hand over ownership or leave their own workspace. |
| **No data export** | You cannot download your data or recordings in bulk. |
| **No in-app recording** | By design (specification): record calls elsewhere, then upload. |
| **No AI features** | By design (specification). |
| **Other** | Light mode only; no notifications beyond the activity feed; no offline support; sized for one person's job search rather than large teams (the whole workspace loads at once). |

---

## Bottom line

* **As a personal tool on your own computer:** fully functional today.
* **To use it from anywhere or share it with others:** it needs deployment (Phase 9) and an
  email provider (D9).
* **Before trusting it with real recruiter data in production:** the Phase 8 security and QA
  pass is complete; the remaining hardening items (content security policy for scripts,
  hosted configuration, monitoring, backups) are part of Phase 9 — see
  [backend/SECURITY.md](backend/SECURITY.md) §7.

## Roadmap

| Phase | Status |
| --- | --- |
| 0–7 — Architecture, environment, database, auth, API, storage, collaboration, frontend integration | Complete |
| 8 — Testing and QA (security tests, full end-to-end workflow) | Complete |
| 9 — Deployment and operations (Vercel + Supabase, staging/production, monitoring, backups, job scheduling) | Not started |
