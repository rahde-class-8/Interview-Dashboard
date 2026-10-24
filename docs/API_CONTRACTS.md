# API Contracts

> **Superseded (planning draft).** The current backend design is in [`docs/backend/`](./backend/ARCHITECTURE.md). This file is kept for reference until it is removed (decision D8).

Status: **Proposed** · Version: `v1`
Implementation: Next.js Route Handlers under `src/app/api/v1/`, schemas in
`src/shared/contracts/` (zod), shared by client and server.

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Base path | `/api/v1` |
| Tenancy | Workspace-scoped resources live under `/api/v1/workspaces/{workspaceId}/...` |
| Auth | Supabase session cookie (same origin). Unauthenticated → `401`. |
| Format | JSON, UTF-8, `camelCase` keys. Requests with a body must send `Content-Type: application/json`. |
| IDs | UUID strings; treat as opaque |
| Timestamps | ISO 8601 UTC (`2026-10-24T14:00:00Z`) |
| Date-only | `YYYY-MM-DD` (task `dueDate`) |
| Money | Numbers in major units + ISO currency (`{ min: 145000, max: 175000, currency: "USD", period: "year" }`) |
| Partial update | `PATCH` with only the changed fields; `null` clears a nullable field |
| Pagination | Cursor: `?limit=50&cursor=<opaque>` → `{ data: [...], nextCursor: string \| null }`. Default 50, max 200. |
| Sorting | Fixed per endpoint (documented below) in MVP |
| Idempotency | `Idempotency-Key` header honored on `POST` for calls, recordings and invitations (24 h window) |
| Concurrency | Shared notes require `version` on update; mismatch → `409 version_conflict`. Other resources: last write wins. |
| Time zone | Endpoints computing "today/overdue" accept `?tz=Area/City` (IANA); default UTC |
| Caching | `Cache-Control: no-store` on all responses |

### 1.1 Errors

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Request validation failed.",
    "details": [{ "path": "durationMinutes", "message": "Must be between 1 and 600." }],
    "requestId": "req_01J9..."
  }
}
```

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `validation_failed`, `bad_request` | Schema/semantic validation |
| 401 | `unauthenticated` | No/expired session |
| 403 | `forbidden` | Member lacks the required role |
| 404 | `not_found` | Missing **or** in a workspace the caller cannot access (no existence leaks) |
| 409 | `conflict`, `version_conflict`, `duplicate`, `in_use` | Unique violations, stale versions, delete blocked by references |
| 413 | `file_too_large` | Recording exceeds limit |
| 415 | `unsupported_media_type` | Recording type not allowed |
| 422 | `upload_verification_failed` | Uploaded object fails checks |
| 429 | `rate_limited` | Includes `Retry-After` |
| 507 | `quota_exceeded` | Workspace storage quota |
| 500 | `internal_error` | Unexpected (no internals leaked) |

### 1.2 Role requirements

Each endpoint lists the minimum role: **V**iewer, **C**ommenter, **E**ditor, **O**wner.
See [SECURITY_MODEL §4](./SECURITY_MODEL.md#4-roles-and-permissions).

## 2. Account and workspaces

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/me` | auth | Profile + memberships |
| PATCH | `/me` | auth | Update `displayName`, `headline` |
| DELETE | `/me` | auth | Delete account (body `{ "confirm": "DELETE" }`); fails `409` if the caller owns a workspace with other members and has not transferred it |
| GET | `/workspaces` | auth | Workspaces the caller belongs to |
| POST | `/workspaces` | auth | Create workspace (caller becomes owner) |
| GET | `/workspaces/{ws}` | V | Workspace detail + caller's role |
| PATCH | `/workspaces/{ws}` | O | `name`, `recordingRetentionDays` |
| DELETE | `/workspaces/{ws}` | O | Body `{ "confirmName": "<workspace name>" }` |
| GET | `/workspaces/{ws}/dashboard?tz=` | V | Metrics + widgets (definitions match DATABASE_SCHEMA §6) |
| GET | `/workspaces/{ws}/search?q=` | V | Up to 20 results across opportunities, calls, questions (`q` ≥ 2 chars) |

```ts
type Me = {
  id: string; email: string; displayName: string; headline: string | null;
  memberships: { workspaceId: string; workspaceName: string; role: Role }[];
};
type Role = "owner" | "editor" | "commenter" | "viewer";
type Workspace = {
  id: string; name: string; ownerId: string; role: Role;
  recordingRetentionDays: 30 | 90 | 180 | 365 | null;
  storage: { usedBytes: number; quotaBytes: number };
  createdAt: string; updatedAt: string;
};
type Dashboard = {
  metrics: { totalCalls: number; activeOpportunities: number; upcomingInterviews: number;
             pendingFollowUps: number; overdueFollowUps: number };
  recentCalls: CallSummary[];                         // 5 most recent
  pipeline: { stage: Stage; count: number }[];        // all 6 stages, zero-filled
  upcomingPrepTasks: Task[];                          // 6, incomplete, by dueDate (nulls last)
  skillFrequency: { label: string; count: number }[]; // top 8
};
```

## 3. Members and invitations (collaboration)

| Method | Path | Role | Description |
| --- | --- | --- | --- |
| GET | `/workspaces/{ws}/members` | V | Members with profile names |
| PATCH | `/workspaces/{ws}/members/{userId}` | O | `{ role: "editor" \| "commenter" \| "viewer" }` |
| DELETE | `/workspaces/{ws}/members/{userId}` | O, or self to leave | Owner cannot be removed |
| POST | `/workspaces/{ws}/transfer-ownership` | O | `{ newOwnerId }` (must be a member); previous owner becomes editor |
| GET | `/workspaces/{ws}/invitations` | O | Pending/recent invitations |
| POST | `/workspaces/{ws}/invitations` | O | `{ email, role }`; sends email; `409 duplicate` if member or pending invite exists |
| DELETE | `/workspaces/{ws}/invitations/{id}` | O | Revoke |
| POST | `/invitations/accept` | auth | `{ token }`; caller's email must match; returns `{ workspaceId, role }` |

```ts
type Member = { userId: string; displayName: string; email: string; role: Role; joinedAt: string };
type Invitation = {
  id: string; email: string; role: Exclude<Role, "owner">;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: { id: string; displayName: string }; expiresAt: string; createdAt: string;
};
```

## 4. Companies and recruiters

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/workspaces/{ws}/companies?q=` | V | Sorted by name |
| POST | `/workspaces/{ws}/companies` | E | `409 duplicate` on same name (case-insensitive) — response includes existing `id` |
| PATCH | `/workspaces/{ws}/companies/{id}` | E | |
| DELETE | `/workspaces/{ws}/companies/{id}` | E | `409 in_use` if opportunities reference it |
| GET | `/workspaces/{ws}/recruiters?q=&companyId=` | V | Sorted by name |
| POST | `/workspaces/{ws}/recruiters` | E | |
| GET/PATCH/DELETE | `/workspaces/{ws}/recruiters/{id}` | V/E/E | Delete nulls references on opportunities/calls |

```ts
type Company = { id: string; name: string; industry: string | null; headquarters: string | null;
                 website: string | null; createdAt: string; updatedAt: string };
type CompanyInput = { name: string /*1–200*/; industry?: string | null; headquarters?: string | null;
                      website?: string | null /* http(s) URL */ };
type Recruiter = { id: string; name: string; email: string | null; phone: string | null;
                   agency: string | null; companyId: string | null; createdAt: string; updatedAt: string };
type RecruiterInput = { name: string /*1–120*/; email?: string | null; phone?: string | null;
                        agency?: string | null; companyId?: string | null };
```

## 5. Opportunities

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/workspaces/{ws}/opportunities?stage=&q=&limit=&cursor=` | V | Sorted by `updatedAt desc`; each item includes `counts` |
| POST | `/workspaces/{ws}/opportunities` | E | Accepts `companyId` **or** `companyName` (find-or-create), `recruiterId` **or** `newRecruiter` |
| GET | `/workspaces/{ws}/opportunities/{id}` | V | Includes company, recruiter, counts |
| PATCH | `/workspaces/{ws}/opportunities/{id}` | E | Any input field incl. `prepNotes`; `stage` changes log activity |
| DELETE | `/workspaces/{ws}/opportunities/{id}` | E | Cascades; response `{ deleted: { calls, recordings, interviews, tasks } }` |
| GET | `/workspaces/{ws}/opportunities/{id}/intel` | V | Aggregated recruiter intelligence |

```ts
type Stage = "new" | "recruiter_screen" | "technical" | "hiring_manager" | "offer" | "closed";
type Compensation = { min: number; max: number; currency: string; period: "year" | "hour" };
type Opportunity = {
  id: string; title: string; location: string;
  workMode: "remote" | "hybrid" | "onsite";
  employmentType: "full_time" | "contract" | "contract_to_hire" | "part_time";
  compensation: Compensation | null; stage: Stage; stageChangedAt: string;
  jobDescription: string; requiredSkills: string[]; preferredSkills: string[]; prepNotes: string;
  company: { id: string; name: string };
  recruiter: { id: string; name: string } | null;
  counts: { calls: number; upcomingInterviews: number; pendingFollowUps: number;
            prepTasks: number; prepTasksDone: number };
  createdAt: string; updatedAt: string;
};
type OpportunityInput = {
  title: string; location?: string; workMode: Opportunity["workMode"];
  employmentType: Opportunity["employmentType"]; compensation?: Compensation | null; stage?: Stage;
  jobDescription?: string; requiredSkills?: string[]; preferredSkills?: string[]; prepNotes?: string;
} & ({ companyId: string } | { companyName: string })
  & ({ recruiterId?: string | null } | { newRecruiter: RecruiterInput });
type OpportunityIntel = {
  callCount: number; technicalTopics: string[]; behavioralThemes: string[];
  hiringManagerPriorities: string[]; redFlags: string[];
  advice: { callId: string; callAt: string; text: string }[];   // newest first
};
```

Validation: `compensation.max >= compensation.min`; arrays ≤ 50 items, items 1–100 chars,
de-duplicated case-insensitively.

## 6. Recruiter calls

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/workspaces/{ws}/calls?q=&stage=&opportunityId=&limit=&cursor=` | V | Sorted by `callAt desc`; `q` matches recruiter, company, job title; `stage` filters by opportunity stage |
| POST | `/workspaces/{ws}/calls` | E | **Composite, transactional** (`log_recruiter_call` RPC). `Idempotency-Key` supported. |
| GET | `/workspaces/{ws}/calls/{id}` | V | Full detail |
| PATCH | `/workspaces/{ws}/calls/{id}` | E | Same composite shape, all sections optional |
| DELETE | `/workspaces/{ws}/calls/{id}` | E | Cascades recordings (objects enqueued for purge) and its follow-up |

```ts
type CallSummary = {
  id: string; callAt: string; durationMinutes: number; interestLevel: number;
  recruiter: { id: string; name: string } | null;
  opportunity: { id: string; title: string; stage: Stage; companyName: string };
  followUp: { id: string; title: string; dueDate: string; completed: boolean } | null;
  recordingCount: number;
};
type Call = CallSummary & {
  hiringManagerPriorities: string[]; interviewStages: string[]; recruiterAdvice: string;
  technicalTopics: string[]; behavioralThemes: string[]; redFlags: string[];
  candidateQuestions: { id: string; question: string; answer: string }[];
  notes: string; createdAt: string; updatedAt: string;
};
type CallInput = {
  opportunity: { id: string; updates?: Partial<OpportunityInput> }    // existing (optionally edited)
             | { create: OpportunityInput };                          // new from this call (default stage recruiter_screen)
  recruiter: { id: string; updates?: Partial<RecruiterInput> } | { create: RecruiterInput };
  callAt: string; durationMinutes: number /*1–600*/; interestLevel: number /*1–10*/;
  hiringManagerPriorities?: string[]; interviewStages?: string[]; recruiterAdvice?: string;
  technicalTopics?: string[]; behavioralThemes?: string[]; redFlags?: string[];
  candidateQuestions?: { question: string; answer?: string }[];       // replaces the full list (≤ 30)
  followUp?: { title: string; dueDate: string } | null;               // null removes the call's follow-up
  notes?: string /* ≤ 100,000 chars */;
};
// 201 response
type CallCreated = { call: Call; created: { companyId?: string; recruiterId?: string; opportunityId?: string; followUpTaskId?: string } };
```

Example `POST /api/v1/workspaces/{ws}/calls`:

```json
{
  "opportunity": { "create": { "companyName": "Skyline Robotics", "title": "Cloud DevOps Engineer",
                               "workMode": "hybrid", "employmentType": "full_time" } },
  "recruiter": { "create": { "name": "Casey Nguyen", "email": "casey@example.com" } },
  "callAt": "2026-10-24T15:00:00Z",
  "durationMinutes": 30,
  "interestLevel": 7,
  "technicalTopics": ["AWS", "Terraform"],
  "followUp": { "title": "Send thank-you note", "dueDate": "2026-10-27" },
  "notes": "Team runs EKS on AWS."
}
```

## 7. Recordings

Full workflow: [RECORDING_STORAGE](./RECORDING_STORAGE.md).

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/workspaces/{ws}/calls/{callId}/recordings` | V | Metadata only; excludes `deleted` |
| POST | `/workspaces/{ws}/calls/{callId}/recordings` | E | Init upload → `201 { recording, upload }`; errors `413`, `415`, `507`, `429` |
| POST | `/workspaces/{ws}/recordings/{id}/upload-url` | E (uploader) | New token while `pending_upload` |
| POST | `/workspaces/{ws}/recordings/{id}/complete` | E (uploader) | Verify → `200 { recording }` or `422` |
| PATCH | `/workspaces/{ws}/recordings/{id}` | E | `{ durationSeconds }` only |
| GET | `/workspaces/{ws}/recordings/{id}/playback-url` | **E** | `{ url, expiresAt }` (5-minute TTL); `409` if not `uploaded` |
| DELETE | `/workspaces/{ws}/recordings/{id}` | O, or E if uploader | `204`; object purged asynchronously |

```ts
type Recording = {
  id: string; callId: string; originalFilename: string;
  mimeType: "audio/mpeg" | "audio/mp4" | "audio/wav";
  sizeBytes: number; durationSeconds: number | null;
  status: "pending_upload" | "uploaded" | "failed";
  failureReason: string | null; uploadedBy: { id: string; displayName: string } | null;
  createdAt: string; uploadedAt: string | null; deleteAfter: string | null;
  canPlay: boolean;                                   // derived from caller's role
};
type RecordingInit = { filename: string /*1–255*/; mimeType: string; sizeBytes: number; consentAttested: true };
type UploadTicket = { signedUrl: string; token: string; path: string; contentType: string; expiresAt: string };
```

## 8. Interviews

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/workspaces/{ws}/interviews?opportunityId=&status=&from=&to=&limit=&cursor=` | V | Sorted by `scheduledAt asc` |
| POST | `/workspaces/{ws}/interviews` | E | |
| GET/PATCH/DELETE | `/workspaces/{ws}/interviews/{id}` | V/E/E | Inline status/outcome via `PATCH` |

```ts
type Interview = {
  id: string; opportunityId: string; title: string;
  stage: "recruiter_screen" | "technical" | "hiring_manager" | "offer";
  scheduledAt: string; durationMinutes: number; format: "video" | "phone" | "onsite";
  interviewers: string[]; status: "scheduled" | "completed" | "cancelled" | "rescheduled";
  outcome: "pending" | "advanced" | "rejected" | "offer"; notes: string;
  createdAt: string; updatedAt: string;
};
```

## 9. Tasks (follow-ups and preparation)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/workspaces/{ws}/tasks?kind=&opportunityId=&status=pending\|completed&dueBefore=&limit=&cursor=` | V | Pending first by `dueDate asc` (nulls last), then completed |
| POST | `/workspaces/{ws}/tasks` | E | |
| PATCH | `/workspaces/{ws}/tasks/{id}` | E | `{ completed: true }` sets `completedAt`; `false` clears it |
| DELETE | `/workspaces/{ws}/tasks/{id}` | E | |

```ts
type Task = {
  id: string; kind: "follow_up" | "preparation"; opportunityId: string; callId: string | null;
  category: "technical" | "behavioral" | "research" | "logistics" | null;
  title: string; dueDate: string | null; completed: boolean; completedAt: string | null;
  createdAt: string; updatedAt: string;
};
type TaskInput =
  | { kind: "follow_up"; opportunityId: string; title: string; dueDate: string }
  | { kind: "preparation"; opportunityId: string; title: string; category: Task["category"]; dueDate?: string | null };
```

## 10. Preparation content

| Method | Path | Role |
| --- | --- | --- |
| GET / POST | `/workspaces/{ws}/star-stories` | V / E |
| PATCH / DELETE | `/workspaces/{ws}/star-stories/{id}` | E |
| GET | `/workspaces/{ws}/questions?type=&topic=&companyId=\|general&q=&limit=&cursor=` | V |
| POST | `/workspaces/{ws}/questions` | E |
| PATCH / DELETE | `/workspaces/{ws}/questions/{id}` | E |

```ts
type StarStory = { id: string; title: string; situation: string; task: string; action: string;
                   result: string; themes: string[]; createdAt: string; updatedAt: string };
type Question = { id: string; type: "technical" | "behavioral"; topic: string; companyId: string | null;
                  difficulty: "easy" | "medium" | "hard"; question: string; answerNotes: string;
                  createdAt: string; updatedAt: string };
```

## 11. Shared notes, comments, activity

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/workspaces/{ws}/notes` | V | Sorted by `updatedAt desc` |
| POST | `/workspaces/{ws}/notes` | E | |
| GET | `/workspaces/{ws}/notes/{id}` | V | |
| PATCH | `/workspaces/{ws}/notes/{id}` | E | Requires `version`; `409 version_conflict` returns the current note |
| DELETE | `/workspaces/{ws}/notes/{id}` | E | |
| GET | `/workspaces/{ws}/notes/{id}/comments` | V | Oldest first |
| POST | `/workspaces/{ws}/notes/{id}/comments` | C | |
| PATCH | `/workspaces/{ws}/comments/{id}` | author | `{ body }` |
| DELETE | `/workspaces/{ws}/comments/{id}` | author or O | Soft delete |
| GET | `/workspaces/{ws}/activity?limit=&cursor=` | V | Newest first |

```ts
type SharedNote = { id: string; title: string; body: string; opportunityId: string | null; version: number;
                    updatedBy: { id: string; displayName: string } | null; createdAt: string; updatedAt: string };
type Comment = { id: string; noteId: string; body: string; author: { id: string; displayName: string } | null;
                 createdAt: string; editedAt: string | null };
type ActivityEvent = { id: string; actor: { id: string; displayName: string } | null;
                       action: string; entityType: string; entityId: string | null;
                       metadata: Record<string, string | number | null>; createdAt: string };
```

## 12. Internal job endpoints (not public)

`POST /api/internal/jobs/{purge-storage | abandoned-uploads | retention | reconcile-storage | expire-invitations}`
— authenticated with `Authorization: Bearer ${CRON_SECRET}` (constant-time compare), called
by Supabase Cron. Not routed through user sessions; excluded from CSP/session middleware.

## 13. Frontend action → endpoint mapping

| `useActions()` method | Endpoint |
| --- | --- |
| `ensureCompany` | Folded into opportunity/call composite inputs (`companyName`) |
| `saveRecruiter` | `POST/PATCH /recruiters` (or composite) |
| `saveOpportunity`, `updateOpportunity`, `setOpportunityStage` | `POST/PATCH /opportunities` |
| `deleteOpportunity` | `DELETE /opportunities/{id}` |
| `saveCall` (+ follow-up) | `POST /calls` or `PATCH /calls/{id}` |
| `deleteCall` | `DELETE /calls/{id}` |
| `addRecording` / `updateRecording` / `removeRecording` | `POST .../recordings` + `complete` / `PATCH` / `DELETE` |
| `saveFollowUp`, `savePrepTask`, `toggle*`, `delete*` | `/tasks` |
| `saveInterview`, `updateInterview`, `deleteInterview` | `/interviews` |
| `saveStarStory`, `deleteStarStory` | `/star-stories` |
| `saveQuestion`, `deleteQuestion` | `/questions` |
| `inviteCollaborator`, `setCollaboratorRole`, `removeCollaborator` | `/invitations`, `/members` |
| `saveNote`, `addComment`, `deleteComment` | `/notes`, `/comments` |

## 14. Versioning

Breaking changes require `/api/v2`. Additive changes (new optional fields, new endpoints)
are allowed in `v1`. Clients must ignore unknown response fields.
