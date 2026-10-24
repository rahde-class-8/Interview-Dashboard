# Recording Storage

How call recordings are uploaded, verified, played back, retained and deleted.
Implemented in Phase 5. Related: [API.md §7.1](API.md#71-recordings) (endpoints),
[DATABASE.md](DATABASE.md) (tables and functions), [ARCHITECTURE.md](ARCHITECTURE.md) (design).

> **Scope.** The application stores recordings that users created **outside** the app
> (for example with their phone or meeting software) and only after they confirm that
> everyone recorded consented. The app does **not** record calls, use the microphone or
> capture live audio.

---

## 1. Overview

| Item | Value |
| --- | --- |
| Object store | Supabase Storage, bucket `recordings` (**private**) |
| Audio in Postgres | **Never.** Postgres holds metadata only (`public.recordings`). |
| Object key | `{workspace_id}/{recruiter_call_id}/{recording_id}.{mp3\|m4a\|wav}`, chosen by the server and enforced by a check constraint |
| Client access to Storage | Only through server-issued signed URLs. `storage.objects` has **no policies**, so every request with a user or publishable key is refused. |
| Privileged key | `SUPABASE_SECRET_KEY`, server-only (`src/server/core/supabase/admin.ts`, `import "server-only"`) |
| Code | `src/server/recordings/*`, routes under `src/app/api/v1/workspaces/[workspaceId]/{calls/[id]/recordings,recordings/[id]/**}`, job `src/app/api/internal/jobs/recording-maintenance` |
| Migration | `supabase/migrations/20261024200000_recording_storage.sql` |

Storage access is protected **independently** of database access: even a workspace owner
signed in with a valid session cannot list, download, upload, overwrite or delete objects
through the Storage API (verified by `tests/api/recordings.spec.ts` and
`supabase/tests/database/009_recording_storage.test.sql`).

## 2. Supported formats and limits

| Format | Extension | Stored MIME type | Browser MIME types accepted at upload start | Signature checked after upload |
| --- | --- | --- | --- | --- |
| MP3 | `.mp3` | `audio/mpeg` | `audio/mpeg`, `audio/mp3`, empty | `ID3` tag, or MPEG audio frame sync (`0xFFE…`, layer ≠ 0) |
| M4A | `.m4a` | `audio/mp4` | `audio/mp4`, `audio/x-m4a`, `audio/m4a`, `audio/aac`, empty | `ftyp` box with an audio/ISO brand (`M4A `, `M4B `, `isom`, `mp42`, …); video brands such as `qt  ` are refused |
| WAV | `.wav` | `audio/wav` | `audio/wav`, `audio/x-wav`, `audio/wave`, `audio/vnd.wave`, empty | `RIFF` … `WAVE` |

The extension decides the format; a reported MIME type that does not belong to it is
rejected. The bucket accepts only the three stored MIME types, so the upload's
`Content-Type` must be the `contentType` the server returns.

| Limit | Value | Where enforced | Configure |
| --- | --- | --- | --- |
| File size | **100 MiB** (104,857,600 bytes) | API (declared size), bucket `file_size_limit`, DB check `recordings_file_size_max`, re-checked after upload | `NEXT_PUBLIC_MAX_RECORDING_SIZE_MB` can **lower** it (browser and server read the same value); it can never exceed 100 MiB |
| Workspace quota | **2 GiB** of pending + uploaded recordings | DB trigger `app.enforce_recording_limits` (serialized per workspace with an advisory lock) | `workspaces.storage_quota_bytes` (max 100 GiB; service role only) |
| Recordings per call | **10** pending + uploaded | same trigger | migration |
| Upload starts and URL renewals | **30 per user per hour** | `public.consume_rate_limit` (Postgres counters, shared by all server instances) | `src/server/recordings/config.ts` |
| Playback URLs | **120 per user per hour** | same | same |
| Upload URL validity | **2 hours** (fixed by Supabase) | Storage | n/a (renew with `/upload-url`) |
| Playback URL validity | **5 minutes** | Storage | `PLAYBACK_URL_TTL_SECONDS` |

The local stack's global Storage limit (`supabase/config.toml` → `[storage] file_size_limit`)
is set to `100MiB`. On hosted projects the global limit is a project setting
(Storage → Settings) and must be **at least** 100 MiB.

## 3. Upload flow

```
Browser                         Next.js API (user session)           Supabase
───────                         ──────────────────────────           ────────
1. POST /calls/{id}/recordings ─▶ auth · role ≥ editor · zod (consent,
   {fileName, fileSize,           extension, MIME, size) · call exists ·
    mimeType, consentConfirmed}   rate limit
                                  INSERT recordings (pending) ─ user client ─▶ RLS + quota/count trigger
                                  createSignedUploadUrl(path) ─ secret key ─▶ Storage
◀─ 201 {recording, upload:{signedUrl, token, path, contentType, maxBytes, expiresAt}}
2. PUT file to signedUrl ───────────────────────────────────────────────────▶ Storage (path-bound token,
   (Content-Type = contentType)                                                no overwrite, bucket MIME/size)
3. POST /recordings/{id}/complete ▶ uploader only · stat object (exists, size,
   {durationSeconds?}               content type) · read first 16 bytes via a
                                    60 s signed URL · detect format
                                  ├ valid   → mark_recording_uploaded (retention deadline)
                                  └ invalid → mark_recording_failed + remove object → 422
◀─ 200 Recording {status: "uploaded"}
```

* **Server-chosen paths.** The user's file name is stored as metadata only; it never
  becomes part of the object key, so there is no path traversal or collision.
* **Path-bound, one-time tokens.** A signed upload token only works for its exact path and
  cannot overwrite an existing object (`upsert: false`), so a verified file cannot be
  replaced.
* **Verification is server-side.** Client checks (`src/features/recordings/validate-recording.ts`)
  are a convenience; the server re-checks size, `Content-Type` and the audio signature
  after the upload. Note the signature check confirms the container format; it does not
  decode the audio.
* **Consent.** `consentConfirmed: true` is required; the time is stored in
  `recordings.consent_confirmed_at` (NOT NULL).
* **Quota reservation.** A pending recording reserves its declared size against the quota
  until it is completed, fails or is abandoned.

Example (browser, Phase 7 will wrap this):

```ts
const start = await fetch(`/api/v1/workspaces/${ws}/calls/${callId}/recordings`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type, consentConfirmed: true }),
});
const { recording, upload } = await start.json();
await fetch(upload.signedUrl, { method: "PUT", headers: { "Content-Type": upload.contentType }, body: file });
await fetch(`/api/v1/workspaces/${ws}/recordings/${recording.id}/complete`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ durationSeconds }),
});
```

(`supabase.storage.from("recordings").uploadToSignedUrl(path, token, file, { contentType })`
with the publishable key works too; the token, not the key, authorizes the upload.)

### 3.1 Interrupted and failed uploads

| Situation | What happens | Client action |
| --- | --- | --- |
| Network drop / tab closed during upload | Object absent (Storage writes are atomic); recording stays `pending` | Retry the PUT; if the URL expired (2 h), `POST /recordings/{id}/upload-url` for a fresh one |
| `complete` called before the file arrived | `409 upload_incomplete`, recording stays `pending` | Upload, then call `complete` again |
| `complete` called twice | Second call returns the recording (idempotent) | — |
| Wrong content, size or type | `422 invalid_recording`; recording `failed` with `failureReason`; object removed | Start a new upload |
| Upload never completed | After **24 h** the maintenance job marks it `failed` ("The upload was not completed.") and removes any object | Start a new upload |
| Storage unavailable when starting | `503 storage_unavailable`; the reservation is released (`failed`) | Retry later |

Only the user who started an upload can renew its URL or complete it.

## 4. Playback authorization

`GET /recordings/{id}/playback-url` returns `{ url, expiresAt }`:

1. Caller must be signed in and a workspace **owner or editor** (decision D4). Commenters
   and viewers can see recording metadata (name, size, duration) but get `403`.
   Non-members get `404`.
2. The recording must be `uploaded` (`409` otherwise; deleted recordings are `404`).
3. Rate limit: 120 URLs per user per hour (`429 rate_limited`).
4. A Storage signed URL valid for **5 minutes** is returned with `Cache-Control: no-store`.
   Use it directly as `<audio src>`; Storage supports HTTP range requests for seeking. When
   it expires, request a new one. URLs are never stored in the database.

There is no public URL: `getPublicUrl()` links do not work for the private bucket.

## 5. Deletion behavior

`DELETE /recordings/{id}` — allowed for the workspace **owner**, or the **editor who
uploaded** the recording.

1. `soft_delete_recording` sets `status = deleted`, `deleted_at = now()`; the trigger
   `app.enqueue_recording_cleanup` adds the object to `storage_cleanup_queue`
   (reason `user_delete`) in the same transaction.
2. The API removes the object immediately and marks the queue entry completed. If Storage
   is unreachable, the response is still `204` and the maintenance job removes the object
   later from the queue.
3. The metadata row stays as a tombstone (invisible to the API) for **30 days**, then is
   purged.

Other ways objects are queued:

| Cause | Queue reason |
| --- | --- |
| User deletes a recording | `user_delete` |
| Call, opportunity or workspace deleted (cascade) | `cascade` |
| Retention deadline reached | `retention` |
| Upload abandoned, or orphaned object found | `abandoned` |
| Upload failed verification | `failed_validation` |
| Account deletion (reserved for Phase 9 data-export/erasure work) | `account_deletion` |

Deleting a workspace or user account never leaves objects behind: queue entries have no
foreign key to the workspace, so they survive the cascade.

## 6. Retention rules

* Default: keep recordings until deleted (`workspaces.recording_retention_days = NULL`).
* Owners can choose 30, 90, 180 or 365 days (`PATCH /api/v1/workspaces/{id}`).
* `recordings.delete_after = uploaded_at + retention` is set when an upload completes.
* **Changing the setting applies to existing recordings too** (trigger
  `app.apply_retention_change`). Shortening it can make older recordings due at the next
  maintenance run; the frontend must warn before saving (Phase 7). "Keep until deleted"
  clears all deadlines.
* The maintenance job deletes due recordings (reason `retention`).

## 7. Maintenance job

`POST /api/internal/jobs/recording-maintenance` with
`Authorization: Bearer $CRON_SECRET` (≥ 32 characters; the route answers `404` when the
secret is not configured and `401` for wrong credentials; user sessions are not accepted).
It is not part of the public API.

Each run:

1. `public.run_recording_maintenance()` (one transaction):
   abandoned uploads (`pending` > 24 h) → `failed`; due recordings → `deleted`;
   **orphan reconciliation**: objects older than 1 h in the bucket without a live
   (`pending`/`uploaded`) recording are queued; tombstones older than 30 days purged;
   completed queue entries older than 30 days and rate-limit windows older than 2 days purged.
2. Up to 10 batches of 100 queue entries are claimed with `public.claim_storage_cleanup`
   (`FOR UPDATE SKIP LOCKED`, 5-minute claim lease, so concurrent or crashed runs never
   lose entries), removed from Storage and marked completed. Failures record `last_error`
   and are retried; after 10 attempts an entry is left for manual review.

Response: `{ abandoned, expired, orphansQueued, tombstonesPurged, objectsRemoved, removalFailures }`.

Run locally:

```bash
curl -X POST http://localhost:3000/api/internal/jobs/recording-maintenance \
  -H "Authorization: Bearer $(grep ^CRON_SECRET= .env.local | cut -d= -f2)"
```

**Scheduling** (recommended every 10 minutes) is part of Phase 9 deployment and requires
approval: Supabase Cron (`pg_cron` + `pg_net`) or the hosting platform's cron calling the
URL above. No schedule is created by the migrations. Until a schedule exists, deletions are
still immediate; only abandoned uploads, retention and deferred removals wait.

## 8. Security properties

| Threat | Mitigation |
| --- | --- |
| Public exposure of recordings | Private bucket; no public URLs; pgTAP asserts no public bucket |
| Direct download/listing with a user session | No `storage.objects` policies → Storage denies all non-service requests |
| Download by a viewer/commenter | Playback URLs only for owner/editor (server check, not hidden UI) |
| Cross-workspace access | Every query filtered by workspace and RLS; non-members get 404 |
| Long-lived links leaking | 5-minute playback URLs, `no-store`, never persisted |
| Uploading arbitrary files | Extension + MIME allow-list, bucket MIME/size limits, post-upload size/type/signature check |
| Replacing a verified file | Upload tokens are path-bound and cannot overwrite |
| Path manipulation | Server-generated keys, DB check constraint on the key shape |
| Storage exhaustion | 100 MiB/file, 2 GiB/workspace, 10/call, 30 starts/hour/user |
| URL-minting abuse | Postgres-backed rate limits |
| Secret key exposure | Only in server-only modules; never `NEXT_PUBLIC_*`; job secret compared in constant time |
| Orphaned objects | Cleanup queue in the same transaction as the metadata change + periodic reconciliation |

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `403` on upload start | Caller is a commenter/viewer; editors and owners upload |
| `400 validation_failed` on `mimeType` | The browser reported a type that does not match the extension (e.g. a video). Convert the file to MP3, M4A or WAV |
| `413 payload_too_large` | File over the limit (default 100 MiB). Compress or trim the recording |
| `409 quota_exceeded` | Workspace quota (2 GiB) or 10 recordings per call reached. Delete old recordings |
| `429 rate_limited` | Too many upload starts or playback URLs this hour |
| Upload PUT fails with "mime type … is not supported" | The PUT `Content-Type` must be the `contentType` returned by the server |
| Upload PUT fails with "The resource already exists" | The file was already uploaded; call `complete` |
| Upload PUT fails with "Invalid signature" / `400` | Token used for another path, or expired (> 2 h). Request `/upload-url` |
| `409 upload_incomplete` on `complete` | The PUT did not finish; retry it |
| `422 invalid_recording` | File content/size/type did not match. Check the file plays locally and is really MP3/M4A/WAV |
| `503 storage_unavailable` | Storage unreachable. Local: `npm run supabase:status`; restart with `npm run supabase:stop && npm run supabase:start` (data is kept) |
| Playback URL returns `400`/`403` after a while | It expired (5 min); request a new one |
| Files larger than 50 MB fail locally | Local Storage was started before the 100 MiB config change; restart the local stack |
| Maintenance route returns `404` | `CRON_SECRET` unset or shorter than 32 characters (`npm run env:local` generates one) |
| Queue entries with `attempts = 10` | Removal failed repeatedly; inspect `last_error` in `storage_cleanup_queue` (Studio), fix the cause, then reset `attempts` to 0 |

Useful queries (Studio SQL editor, local):

```sql
-- Recording states per workspace
select workspace_id, status, count(*), sum(file_size) from recordings group by 1, 2;
-- Pending cleanup work
select reason, count(*), max(attempts) from storage_cleanup_queue where completed_at is null group by 1;
-- Run the database part of maintenance by hand
select public.run_recording_maintenance();
```
