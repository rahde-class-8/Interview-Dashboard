# API Reference (v1)

Status: **Phase 4 implemented and tested locally** (2026-10-24).
Code: `src/app/api/v1/**/route.ts` (thin), `src/server/**` (services), `src/shared/contracts/**` (zod schemas + types).
Tests: `tests/api/*.spec.ts` (28 HTTP tests with real sessions), `supabase/tests/database/008_services.test.sql`.

Not in this phase: recordings (Phase 5); members, invitations, notes, comments, activity (Phase 6).

---

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Base path | `/api/v1`; workspace resources under `/api/v1/workspaces/{workspaceId}/…` |
| Authentication | Supabase session cookie set by sign-in (same origin). Missing/expired → `401 unauthenticated`. |
| Authorization | Membership role per workspace (see §1.2). Enforced by RLS in the database; the API also checks roles to return precise errors. |
| Format | JSON, UTF-8, camelCase. Request bodies must be `Content-Type: application/json`. |
| IDs | UUIDs. Malformed or unknown ids → `404`. |
| Timestamps / dates | ISO-8601 with offset (`2026-10-17T14:00:00Z`) / `YYYY-MM-DD` |
| Partial updates | `PATCH` changes only the fields sent; `null` clears nullable fields; an empty body → `400` |
| Text lists | Skills, topics, themes etc. are trimmed and de-duplicated case-insensitively |
| Pagination | `?limit=1..200` (default 50) and `?cursor=` → `{ "data": [...], "nextCursor": "…" | null }` |
| Caching | Every response: `Cache-Control: no-store`, `X-Request-Id: <uuid>` |
| CSRF | Mutations reject other origins (`403`) and non-JSON bodies (`415`); session cookies are `SameSite=Lax` |
| Limits | Request bodies ≤ 1 MB (`413`) |

Pagination is offset-based behind an opaque cursor: simple and adequate for MVP volumes;
rows created while you page can shift results by one.

### 1.1 Errors

```json
{
  "error": {
    "code": "validation_failed",
    "message": "The request contains invalid values.",
    "details": [{ "path": "interestLevel", "message": "Too big: expected number to be <=10" }],
    "requestId": "3f6c…"
  }
}
```

| Status | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed` | Body/query fails validation (with `details`), or a database check rejects a value |
| 400 | `invalid_json` | Body is not valid JSON |
| 400 | `invalid_reference` | A referenced record (e.g. `companyId`) does not exist in this workspace |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Member without the required role, or a cross-origin mutation |
| 404 | `not_found` | Unknown id, or a workspace the caller is not a member of (no existence leak) |
| 409 | `conflict` | Unique constraint (e.g. company name already exists), a state conflict (e.g. inviting an existing member), or a stale note `version` (body also contains `current`) |
| 409 | `in_use` | Delete blocked because other records reference the row |
| 409 | `quota_exceeded` | Workspace storage quota or the per-call recording limit reached |
| 409 | `upload_incomplete` | Recording `complete` called before the file reached Storage |
| 413 | `payload_too_large` | Body > 1 MB, or a recording above the size limit |
| 415 | `unsupported_media_type` | Mutation body not `application/json` |
| 422 | `invalid_recording` | Uploaded file failed verification (size, type or audio signature) |
| 429 | `rate_limited` | Too many upload starts or playback URLs in the current hour |
| 500 | `internal_error` | Unexpected; logged server-side with the `requestId` (no internals returned) |
| 503 | `storage_unavailable` | File storage could not be reached; retry |

### 1.2 Roles

| Role | Read | Write domain records | Workspace settings / delete |
| --- | :-: | :-: | :-: |
| owner | ✅ | ✅ | ✅ |
| editor | ✅ | ✅ | ❌ |
| commenter | ✅ | ❌ | ❌ |
| viewer | ✅ | ❌ | ❌ |

Below, **Role** is the minimum required: **V** viewer, **E** editor, **O** owner, **auth** any signed-in user.

---

## 2. Account

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/me` | auth | The signed-in user's profile |
| PATCH | `/api/v1/me` | auth | Update `displayName` (1–120) and/or `headline` (≤ 200, nullable). Email is not editable here. |

Response `Me`: `{ id, email, displayName, headline }`.

## 3. Workspaces

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/workspaces` | auth | Workspaces the caller belongs to, with `role` (not paginated: `nextCursor` is always null) |
| POST | `/api/v1/workspaces` | auth | Create a workspace; caller becomes owner. Body `{ "name" }` |
| GET | `/api/v1/workspaces/{workspaceId}` | V | Workspace detail incl. caller's `role` |
| PATCH | `/api/v1/workspaces/{workspaceId}` | O | `{ name?, recordingRetentionDays?: 30\|90\|180\|365\|null }` |
| DELETE | `/api/v1/workspaces/{workspaceId}` | O | Body `{ "confirmName": "<exact name>" }`; deletes everything in the workspace → `204` |

Response `Workspace`: `{ id, name, ownerId, role, recordingRetentionDays, createdAt, updatedAt }`.
Errors: wrong `confirmName` → `400`; non-owner → `403`.

---

## 4. Companies

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/companies?q=&limit=&cursor=` | V | List, sorted by name; `q` matches name (case-insensitive, literal) |
| POST | `…/companies` | E | Create |
| GET | `…/companies/{id}` | V | Get one |
| PATCH | `…/companies/{id}` | E | Partial update |
| DELETE | `…/companies/{id}` | E | Delete → `204`; `409 in_use` while opportunities reference it |

Body (create): `{ name (1–200), industry?, headquarters?, website? (http/https) }` — empty strings become `null`.
Response `Company`: `{ id, workspaceId, name, industry, headquarters, website, createdAt, updatedAt }`.
Errors: duplicate name (case-insensitive) → `409 conflict`.

```http
POST /api/v1/workspaces/7c…/companies
Content-Type: application/json

{ "name": "Northwind Cloud Systems", "website": "https://northwind.example.com" }
```

## 5. Recruiters

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/recruiters?q=&companyId=&limit=&cursor=` | V | List by name; `q` matches name, email, agency |
| POST | `…/recruiters` | E | Create |
| GET / PATCH / DELETE | `…/recruiters/{id}` | V / E / E | Get, partial update, delete (unlinks from opportunities and calls) |

Body: `{ name (1–120), email?, phone? (≤40), agency? (≤120), companyId? }` (email lower-cased).
Response `Recruiter`: `{ id, workspaceId, companyId, name, email, phone, agency, createdAt, updatedAt }`.
Errors: `companyId` from another workspace → `400 invalid_reference`.

## 6. Opportunities

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/opportunities?q=&stage=&companyId=&recruiterId=&sort=&limit=&cursor=` | V | List; `stage` accepts a comma list; `q` matches title, location or company name; `sort=updated` (default, newest first) \| `created` \| `title` |
| POST | `…/opportunities` | E | Create (transactional find-or-create of company and optional new recruiter) |
| GET | `…/opportunities/{id}` | V | Get one |
| PATCH | `…/opportunities/{id}` | E | Partial update (may change company or recruiter) |
| PUT | `…/opportunities/{id}/stage` | E | Change pipeline stage: `{ "stage": "new"\|"recruiter_screen"\|"technical"\|"hiring_manager"\|"offer"\|"closed" }` |
| DELETE | `…/opportunities/{id}` | E | Delete with its calls, interviews, tasks; recordings are queued for storage purge |

Body (create):

```json
{
  "company": { "name": "Harborline Logistics" },
  "recruiter": { "create": { "name": "Priya Raman", "email": "priya@example.com" } },
  "title": "Platform Engineer",
  "location": "Chicago, IL",
  "workMode": "hybrid",
  "employmentType": "full_time",
  "compensation": { "min": 150000, "max": 180000, "currency": "USD", "period": "year" },
  "stage": "new",
  "jobDescription": "…",
  "requiredSkills": ["Kubernetes", "AWS"],
  "preferredSkills": [],
  "prepNotes": ""
}
```

- `company`: `{ "id" }` (existing) or `{ "name" }` (find-or-create, case-insensitive, trimmed). Required on create.
- `recruiter` (optional): `{ "id" }`, `{ "id", "update": {…} }`, `{ "create": {…} }` (belongs to the opportunity's company), or `null` (unlink).
- `compensation`: `null` or `{ min, max ≥ min, currency (3 letters, default USD), period: "year"|"hour" }`.
- `workMode`: `remote|hybrid|onsite`; `employmentType`: `full_time|contract|contract_to_hire|part_time`.

Response `Opportunity`: `{ id, workspaceId, title, location, workMode, employmentType, compensation, stage, stageChangedAt, jobDescription, requiredSkills, preferredSkills, prepNotes, company: { id, name }, recruiter: { id, name } | null, createdAt, updatedAt }`.

## 7. Recruiter calls

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/calls?q=&stage=&opportunityId=&recruiterId=&from=&to=&view=summary\|detail&limit=&cursor=` | V | Call **summaries** (or full calls with `view=detail`), newest first. `q` matches recruiter name, company name or job title; `stage` filters by the opportunity's stage; `from`/`to` bound `callAt` |
| POST | `…/calls` | E | Create a call with its opportunity, recruiter and follow-up **in one transaction** |
| GET | `…/calls/{id}` | V | Full call detail |
| PATCH | `…/calls/{id}` | E | Partial update; can also edit the linked opportunity/recruiter and follow-up (one transaction) |
| DELETE | `…/calls/{id}` | E | Delete with its follow-up; its recordings are queued for storage purge |

Body (create):

```json
{
  "opportunity": {
    "create": { "company": { "name": "Northwind Cloud Systems" }, "title": "AWS Cloud Engineer",
                "workMode": "hybrid", "employmentType": "full_time" }
  },
  "recruiter": { "create": { "name": "Dana Whitfield", "email": "dana@example.com" } },
  "callAt": "2026-10-17T14:00:00Z",
  "durationMinutes": 42,
  "interestLevel": 8,
  "hiringManagerPriorities": ["Terraform ownership"],
  "interviewStages": ["Recruiter screen", "Technical"],
  "recruiterAdvice": "Talk through trade-offs.",
  "technicalTopics": ["AWS", "Terraform"],
  "behavioralThemes": ["Ownership"],
  "redFlags": ["Two Sev-1 incidents last quarter"],
  "candidateQuestions": [{ "question": "On-call?", "answer": "One week in six." }],
  "notes": "Full notes…",
  "followUp": { "title": "Send thank-you email", "dueDate": "2026-10-21" }
}
```

| Field | Rules |
| --- | --- |
| `opportunity` | Required on create: `{ "id" }`, `{ "id", "update": {…opportunity fields} }`, or `{ "create": {…opportunity fields incl. company} }` (created at stage `recruiter_screen` and linked to the call's recruiter) |
| `recruiter` | Optional: `{ "id" }`, `{ "id", "update" }`, `{ "create" }`, or `null` |
| `callAt` | ISO date-time, required on create |
| `durationMinutes` | 1–600, required on create |
| `interestLevel` | 1–10, required on create |
| lists | ≤ 50 items (interview stages ≤ 30) |
| `candidateQuestions` | ≤ 30 of `{ question (1–2000), answer? (≤ 5000) }` — replaces the whole list when sent |
| `notes` | ≤ 100,000 chars |
| `followUp` | `{ title, dueDate }` creates/updates the call's single follow-up (completion kept); `null` removes it; omit to leave it unchanged |

Response `Call` (detail): summary fields plus `hiringManagerPriorities, interviewStages, recruiterAdvice, behavioralThemes, redFlags, candidateQuestions, notes`.
Summary (`CallSummary`): `{ id, workspaceId, callAt, durationMinutes, interestLevel, technicalTopics, opportunity: { id, title, stage, company: { id, name } }, recruiter: { id, name, email, phone, agency } | null, followUp: { id, title, dueDate, completed } | null, recordingCount, createdAt, updatedAt }`.
`recordingCount` counts **uploaded** (playable) recordings only.

Errors: unknown/foreign `opportunity.id` or `recruiter.id` → `404` (and **nothing** from the request is saved);
invalid fields → `400` with `details`.

### 7.1 Recordings

Audio files are stored in private object storage; see [STORAGE.md](STORAGE.md) for the
full upload flow, limits, retention and troubleshooting. The API never streams audio itself.

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/recordings` | viewer | Every call's recordings in the workspace (same `status` filter as below) |
| GET | `/calls/{id}/recordings` | viewer | List a call's recordings. Query: `status` = `active` (default: all but deleted) \| `uploaded` \| `pending` \| `failed`, `limit`, `cursor` |
| POST | `/calls/{id}/recordings` | editor | Start an upload → `201 { recording, upload }` |
| GET | `/recordings/{id}` | viewer | Recording metadata (deleted → `404`) |
| PATCH | `/recordings/{id}` | editor | `{ durationSeconds: 0–86400 \| null }` |
| DELETE | `/recordings/{id}` | owner, or the editor who uploaded it | Soft delete + immediate object removal → `204` |
| POST | `/recordings/{id}/upload-url` | the uploader | Fresh upload URL for a `pending` recording (`409` otherwise) |
| POST | `/recordings/{id}/complete` | the uploader | Verify the stored file → `200 Recording` (`uploaded`); body `{ durationSeconds? }` |
| GET | `/recordings/{id}/playback-url` | owner, editor | `{ url, expiresAt }`, a 5-minute signed URL (`409` unless `uploaded`) |

Start-upload body:

| Field | Rules |
| --- | --- |
| `fileName` | 1–255 chars, extension `.mp3`, `.m4a` or `.wav` (case-insensitive) |
| `fileSize` | integer bytes > 0, ≤ limit (default 100 MiB) else `413` |
| `mimeType` | optional browser-reported type; must match the extension (see STORAGE.md §2) |
| `consentConfirmed` | must be `true` |

`upload`: `{ signedUrl, token, path, contentType, maxBytes, expiresAt }`. PUT the file to
`signedUrl` with `Content-Type: contentType` within 2 hours, then call `complete`.

`Recording`: `{ id, workspaceId, callId, uploadedBy, fileName, mimeType, fileSize,
durationSeconds, status: pending|uploaded|failed, failureReason, consentConfirmedAt,
uploadedAt, deleteAfter, createdAt, updatedAt }`.

Limits: 30 upload starts/renewals and 120 playback URLs per user per hour (`429`),
2 GiB per workspace and 10 recordings per call (`409 quota_exceeded`).

## 8. Interviews

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/interviews?opportunityId=&status=&upcoming=true&from=&to=&order=asc\|desc&limit=&cursor=` | V | List by `scheduledAt`; `upcoming=true` = scheduled and in the future |
| POST | `…/interviews` | E | Schedule |
| GET / PATCH / DELETE | `…/interviews/{id}` | V / E / E | Get, update (incl. `status`, `outcome`), delete |

Body (create): `{ opportunityId, title, stage: recruiter_screen|technical|hiring_manager|offer, scheduledAt, durationMinutes (1–1440), format: video|phone|onsite, interviewers?: string[], status?: scheduled|completed|cancelled|rescheduled, outcome?: pending|advanced|rejected|offer, notes? }`.
Response `Interview` includes `opportunity: { id, title, companyName }`.

## 9. Interview preparation

### 9.1 Preparation tasks

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/preparation-tasks?opportunityId=&status=pending\|completed\|all&category=&limit=&cursor=` | V | List: by due date (undated last), then creation |
| POST | `…/preparation-tasks` | E | `{ opportunityId, title (1–300), category: technical\|behavioral\|research\|logistics, dueDate? }` |
| GET / PATCH / DELETE | `…/preparation-tasks/{id}` | V / E / E | PATCH `{ title?, category?, dueDate?, completed?: boolean }` — `completed` sets/clears `completedAt` |

Response `PreparationTask`: `{ id, workspaceId, opportunityId, title, category, dueDate, completed, completedAt, createdAt, updatedAt }`.

### 9.2 Questions

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/questions?q=&type=&topic=&difficulty=&companyId=<uuid>\|general&limit=&cursor=` | V | Newest first; `q` matches question, answer notes, topic (literal) |
| POST | `…/questions` | E | `{ type: technical\|behavioral, topic, difficulty: easy\|medium\|hard, question, answerNotes?, companyId? }` |
| GET / PATCH / DELETE | `…/questions/{id}` | V / E / E | |

### 9.3 STAR stories

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/star-stories?q=&limit=&cursor=` | V | Most recently updated first |
| POST | `…/star-stories` | E | `{ title, situation?, task?, action?, result?, themes? }` |
| GET / PATCH / DELETE | `…/star-stories/{id}` | V / E / E | |

## 10. Follow-ups

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `…/follow-ups?opportunityId=&status=&due=all\|upcoming\|overdue&asOf=YYYY-MM-DD&limit=&cursor=` | V | By due date. `upcoming` = pending and due on/after `asOf`; `overdue` = pending and due before `asOf`. Pass the user's **local** date as `asOf` (default: today in UTC). |
| POST | `…/follow-ups` | E | `{ opportunityId, title, dueDate }` |
| GET / PATCH / DELETE | `…/follow-ups/{id}` | V / E / E | PATCH `{ title?, dueDate?, completed? }` |

Response `FollowUp`: `{ id, workspaceId, opportunityId, callId, title, dueDate, completed, completedAt, createdAt, updatedAt }`
(`callId` is set for a call's "next action", created via the calls API).

---

## 11. Implementation notes

- **Transactions:** `save_opportunity` and `save_recruiter_call` are `SECURITY INVOKER`
  Postgres functions, so RLS and grants apply exactly as for direct access; a failure at any
  step rolls back the whole request (tested: no orphan company/opportunity/recruiter).
- **Partial updates** in those functions use `jsonb_populate_record(existing_row, patch)`,
  so only sent fields change.
- **Search** escapes LIKE wildcards (`%`, `_`, `\`) and quotes values inside PostgREST `or()`
  filters, so user input cannot change the filter expression (tested with injection strings).
- **Workspace creation** inserts with a server-generated id and reads the row back, because
  `INSERT … RETURNING` is checked against the SELECT policy before the owner membership exists.
- **Recordings** use a server-only secret-key client (`src/server/core/supabase/admin.ts`)
  only for signed Storage URLs and status transitions, always after the caller's role was
  checked with the user's own (RLS-bound) client.
- **Internal jobs** live under `/api/internal/jobs/*`, authenticated with `CRON_SECRET`
  (not user sessions) and are not part of this API (see STORAGE.md §7).
- **Types:** `src/server/core/database.types.ts` is generated (`npm run db:types`); regenerate
  after schema changes.

## 12. Example: create, read, update a call with `fetch`

```ts
const ws = "7c3f…";
const res = await fetch(`/api/v1/workspaces/${ws}/calls`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ opportunity: { id: oppId }, callAt: new Date().toISOString(), durationMinutes: 30, interestLevel: 7 }),
});
if (!res.ok) {
  const { error } = await res.json(); // { code, message, details?, requestId }
  throw new Error(`${error.code}: ${error.message} (${error.requestId})`);
}
const call = await res.json();

await fetch(`/api/v1/workspaces/${ws}/calls/${call.id}`, {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ notes: "Follow up next week", followUp: { title: "Email Dana", dueDate: "2026-10-28" } }),
});
```

## 13. Collaboration

See [COLLABORATION.md](COLLABORATION.md) for the rules behind these endpoints. Paths below
are relative to `/api/v1/workspaces/{workspaceId}` unless they start with `/api/v1`.
Roles: O owner, E editor, C commenter, V viewer (minimum role).

### 13.1 Members

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/members` | V | `{ data: Member[] }` (owner first): `{ userId, displayName, email, role, joinedAt, isYou }` |
| PATCH | `/members/{userId}` | O | `{ role: editor\|commenter\|viewer }`. The owner's role → `409` |
| DELETE | `/members/{userId}` | O, or self | Remove a member, or leave. The owner → `409` |

### 13.2 Invitations

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/invitations?status=pending\|all` | O | `Invitation`: `{ id, workspaceId, email, role, status: pending\|accepted\|revoked\|expired, invitedBy, expiresAt, acceptedAt, createdAt }` |
| POST | `/invitations` | O | `{ email, role }` → `201 { invitation, inviteUrl, token }` (token shown once). `409` if already a member, already invited, or 50 pending. 20/hour |
| DELETE | `/invitations/{id}` | O | Revoke a pending invitation → `204` (`409` if not pending) |
| POST | `/api/v1/invitations/preview` | signed in | `{ token }` → `{ workspaceName, role, invitedByName, expiresAt, emailMatches }`; invalid/used/revoked/expired → `404` |
| POST | `/api/v1/invitations/accept` | signed in | `{ token }` → `{ workspaceId, role }`; other email → `403`; invalid → `404` |

Preview and accept share a limit of 60 attempts per user per hour. No email is sent yet (D9).

### 13.3 Shared notes

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/notes?opportunityId=&view=summary\|detail&limit=&cursor=` | V | Most recently updated first; summaries omit `body` unless `view=detail` |
| POST | `/notes` | E | `{ title (1–200), body? (≤ 100,000), opportunityId? }` |
| GET | `/notes/{id}` | V | `SharedNote`: `{ id, workspaceId, opportunityId, title, body, version, createdBy, updatedBy: { id, displayName } \| null, createdAt, updatedAt }` |
| PATCH | `/notes/{id}` | E | `{ version, title?, body?, opportunityId? }`. Stale `version` → `409 { error, current }` |
| DELETE | `/notes/{id}` | E | Deletes the note and its comments |

### 13.4 Comments

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/comments?noteId=` | V | All comment threads in the workspace, oldest first |
| GET | `/notes/{id}/comments` | V | Oldest first. `Comment`: `{ id, workspaceId, noteId, author, body \| null, deleted, editedAt, createdAt }` |
| POST | `/notes/{id}/comments` | C | `{ body (1–5000) }` |
| PATCH | `/comments/{id}` | C, author only | `{ body }`. Deleted → `409` |
| DELETE | `/comments/{id}` | C (author) or O | Soft delete; the text is erased |

### 13.5 Activity

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/activity?entityType=&entityId=&limit=&cursor=` | V | Newest first. `ActivityEvent`: `{ id, workspaceId, actor, action, entityType, entityId, metadata, summary, createdAt }` |

### 13.6 Realtime

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/api/v1/realtime/token` | signed in | `{ accessToken, expiresAt }` for `supabase.realtime.setAuth()`; join private channel `workspace:{id}` (members only), event `change`, payload `{ table, op, recordId, workspaceId }` |
