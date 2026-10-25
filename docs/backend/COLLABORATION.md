# Collaboration

Workspace-based sharing: invitations, roles, member management, shared notes, comments,
activity tracking and Realtime change notifications. Implemented in Phase 6.
Related: [API.md §13](API.md#13-collaboration) (endpoints), [AUTHENTICATION.md](AUTHENTICATION.md)
(roles and RLS), [DATABASE.md](DATABASE.md) (tables and triggers).

> **What this is not.** Realtime here means *record synchronization*: when a row changes,
> other members are notified and refetch it. It is **not** Google Docs-style simultaneous
> text editing. Shared notes use **optimistic concurrency**: a save based on an outdated
> version is rejected with `409` and the current note, so nobody's edits are silently
> overwritten, but two people cannot type into the same note at the same time and see each
> other's cursors. Simultaneous document editing (e.g. a CRDT engine such as Yjs) is deferred
> to a future release.

---

## 1. Roles

| Capability | Owner | Editor | Commenter | Viewer |
| --- | :-: | :-: | :-: | :-: |
| Read all workspace records, notes, comments, activity | ✅ | ✅ | ✅ | ✅ |
| Receive Realtime change notifications | ✅ | ✅ | ✅ | ✅ |
| Add comments; edit/delete own comments | ✅ | ✅ | ✅ | — |
| Create/edit/delete records and shared notes; upload recordings | ✅ | ✅ | — | — |
| Play recordings (D4) | ✅ | ✅ | — | — |
| Delete any comment (moderation; cannot rewrite text) | ✅ | — | — | — |
| Invite, revoke invitations, change roles, remove members | ✅ | — | — | — |
| Rename workspace, retention settings, delete workspace | ✅ | — | — | — |
| Leave the workspace | — (transfer not yet implemented) | ✅ | ✅ | ✅ |

Every rule is enforced in Postgres (RLS policies, column grants, triggers). The API checks
roles first only to return precise errors (`404` for non-members, `403` for insufficient
roles); hiding buttons in the UI is never relied on. Role changes and removals take effect on
the very next request.

There is exactly one owner per workspace (the creator). **Ownership transfer is not
implemented**; the owner can neither leave nor be demoted (enforced by
`app.protect_workspace_owner`).

## 2. Invitations

```
Owner                          API                                   Invitee (signed in)
─────                          ───                                   ───────────────────
POST /workspaces/{id}/invitations {email, role}
                               ├ owner? rate limit (20/h)
                               ├ token = 32 random bytes (base64url)
                               ├ INSERT invitation (sha256(token) only) ─ trigger: not a member,
                               │                                          no pending duplicate,
                               │                                          ≤ 50 pending
◀── 201 {invitation, inviteUrl: <APP_URL>/invite/<token>, token}   (shown once)
share the link ───────────────────────────────────────────────────▶ opens link
                               POST /invitations/preview {token} ◀── workspace name, role,
                                                                     inviter, emailMatches
                               POST /invitations/accept {token}  ◀── joins with the role
```

| Rule | Enforcement |
| --- | --- |
| Only owners invite, list and revoke | RLS on `workspace_invitations` |
| Roles: editor, commenter, viewer (never owner) | check constraint + zod |
| The raw token is never stored; clients cannot read the hash | SHA-256 in `token_hash`; no SELECT grant on it |
| Single use | `accept_invitation` locks the row and marks it `accepted` |
| Expiry: 7 days | `expires_at`; expired invitations cannot be previewed or accepted, are shown as `expired`, and are marked expired when the same email is invited again |
| Revocable while pending | `DELETE /invitations/{id}` → `revoked` (cannot be reactivated) |
| Bound to the invited email (case-insensitive) | `accept_invitation` compares with the signed-in account's email → `403` otherwise |
| No duplicates | one pending invitation per email per workspace; members cannot be re-invited (`409`) |
| Abuse limits | 20 invitations/hour/owner, 50 pending per workspace, 60 preview/accept attempts/hour/user |
| Tokens stay out of logs | tokens travel in JSON bodies, not API URLs |

**Email delivery is not implemented** — the email provider (decision D9) is still open.
The owner copies `inviteUrl` and shares it. When a provider is chosen (before staging),
the API will send the same link by email; nothing else changes. `APP_URL` (optional,
server-only) sets the link's origin; it defaults to the request origin.

The `/invite/<token>` page is a Phase 7 frontend task (it calls preview, asks the user to
sign in or register with the invited address, then calls accept).

## 3. Member management

| Endpoint | Who | Notes |
| --- | --- | --- |
| `GET /workspaces/{id}/members` | members | owner first; includes display name and email (co-members can see each other's profiles) |
| `PATCH /workspaces/{id}/members/{userId}` `{role}` | owner | editor / commenter / viewer; the owner's role cannot change (`409`) |
| `DELETE /workspaces/{id}/members/{userId}` | owner (others), anyone (self = leave) | the owner cannot leave or be removed (`409`) |

Removing a member keeps the content they created (authorship links stay; their name is
shown only while they still share a workspace with the viewer). Their API access ends
immediately: they cannot request new playback URLs or join channels. A playback URL issued
before removal stays valid for at most its remaining 5 minutes, and see §6 for Realtime
connections that are already open.

## 4. Shared notes and optimistic concurrency

* Editors and owners create, edit and delete notes; everyone in the workspace reads them.
* `version` increments on every content change (trigger `app.bump_note_version`).
  `created_by` / `updated_by` are set by the database (`app.stamp_note_author`); clients cannot
  forge them.
* `PATCH /notes/{id}` must include the `version` the edit was based on. If someone saved in
  between, the response is:

```json
{
  "error": { "code": "conflict", "message": "This note was changed by someone else. …", "requestId": "…" },
  "current": { "id": "…", "title": "…", "body": "…", "version": 3, "updatedBy": { "id": "…", "displayName": "Sam" } }
}
```

  The client shows the latest version, lets the user merge, and retries with `version: 3`.
* Combine with Realtime: when a `shared_notes` change arrives for the note being edited,
  the UI can warn "Sam just saved a newer version" before the user saves.

## 5. Comments

* Comments belong to shared notes; commenters and above add them.
* Only the author edits the text (`editedAt` is set by the database).
* The author or the workspace owner deletes (soft delete). The text is erased in the
  database, and the comment stays in the thread as a placeholder (`deleted: true`,
  `body: null`). Deleted comments cannot be edited or restored. Owners moderating cannot
  rewrite someone else's words (`app.guard_comment_update`).

## 6. Realtime change notifications

| Item | Design |
| --- | --- |
| Mechanism | Supabase Realtime **Broadcast from the database** (`realtime.send`) on **private** channels. `postgres_changes` is not used (the `supabase_realtime` publication is empty), so no table data is replicated to clients. |
| Topic | `workspace:<workspace_id>`, event `change` |
| Payload | `{ table, op: INSERT\|UPDATE\|DELETE, recordId, workspaceId, id }`, which **identifies** the row only. No content, so nothing a member's role would hide is ever pushed. Clients refetch through the API, which applies RLS. |
| Tables | D7: `opportunities`, `recruiter_calls`, `interviews`, `preparation_tasks`, `follow_up_tasks`, `comments`, `activity_events`; plus `shared_notes`, `recordings` (metadata changes), `workspace_members` (role changes and removals, `recordId` = user id), `workspaces` (rename/settings) and, since Phase 7, `companies`, `recruiters`, `questions`, `star_stories` |
| Join authorization | RLS policy `workspace_members_receive_broadcasts` on `realtime.messages`: the user must be a member (any role) of the topic's workspace. Malformed topics are denied. |
| Sending | No INSERT policy → clients cannot publish or forge messages, and presence is not available |
| Token | `GET /api/v1/realtime/token` returns the user's short-lived access token for `supabase.realtime.setAuth()`; session cookies stay HTTP-only and the refresh token is never exposed |

Browser usage (implemented in `src/lib/store/use-realtime-sync.ts`, see FRONTEND_INTEGRATION.md):

```ts
const { accessToken } = await (await fetch("/api/v1/realtime/token")).json();
const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
await supabase.realtime.setAuth(accessToken);              // refresh before expiresAt
supabase
  .channel(`workspace:${workspaceId}`, { config: { private: true } })
  .on("broadcast", { event: "change" }, ({ payload }) => invalidate(payload.table, payload.recordId))
  .subscribe();
```

**Revocation.** Authorization is checked when a channel is joined and whenever the client
calls `setAuth` with a new token (at least every token lifetime, 1 hour by default). A member
removed while connected may therefore keep receiving **id-only** notifications until then,
but every refetch is denied immediately and re-joining fails (tested). When the client sees a
`workspace_members` change for itself, it should refetch `/api/v1/workspaces` and leave the
channel if the workspace is gone.

**Limits.** Notifications are best-effort (no delivery guarantee or replay). After a
reconnect, clients should refetch the visible lists. Each write sends one message
(plus one for its activity event, if any).

## 7. Activity tracking

Important changes are recorded in `activity_events` by database triggers, so every write
path (API, SQL functions, service role) is covered and clients cannot forge or alter
entries (append-only).

| Action | When |
| --- | --- |
| `opportunity.created` / `.stage_changed` / `.deleted` | create; stage change (from → to); delete |
| `call.logged` / `.deleted` | recruiter call created; deleted directly (not via opportunity cascade) |
| `interview.scheduled` / `.status_changed` | create; status change |
| `preparation_task.completed`, `follow_up.completed` | marked complete |
| `recording.uploaded` / `.deleted` / `.expired` | upload verified; deleted by a user; removed by retention |
| `note.created` / `.updated` / `.deleted` | `updated` at most once per editor per note per 10 minutes |
| `comment.added` / `.deleted` | |
| `member.joined` / `.role_changed` / `.removed` / `.left` | |
| `invitation.sent` / `.revoked` | |
| `workspace.renamed` / `.retention_changed` | |

* **Actor:** the signed-in user; for service-role writes the API passes the caller
  (`app.actor_id`), and uploads are attributed to the uploader.
* **Metadata contains display labels only** (titles, company and member names, roles,
  stages). It never contains notes, email addresses, phone numbers, recording file names,
  storage paths or URLs (tested).
* `GET /workspaces/{id}/activity` (any member) returns events newest first with a
  readable `summary`, filterable by `entityType` / `entityId`.
* Unimportant edits (e.g. a location change) are not recorded.

## 8. Security tests

| Test | Covers |
| --- | --- |
| `supabase/tests/database/010_collaboration.test.sql` (55) | invitation rules, preview, email binding, role changes, note authorship and stale updates, comment soft delete, activity content and actors, Realtime topic authorization and publishing denial, cascades |
| `supabase/tests/database/007_rls_special_cases.test.sql` | invitation acceptance, revocation, expiry, comment moderation |
| `tests/api/collaboration.spec.ts` (7) | full invite/accept/revoke/expiry flows, role changes taking effect immediately, removal and leaving, note conflicts, comments, activity visibility, live Realtime subscriptions (member `SUBSCRIBED`, outsider and removed member `CHANNEL_ERROR`, no content in payloads, forged messages not delivered) |
| `tests/unit/collaboration.test.ts` | summaries, tokens, expiry, input validation |

## 9. Not implemented (deferred)

* Simultaneous (character-level) editing, cursors or presence in notes.
* Ownership transfer.
* Invitation emails (D9), shown as copyable links meanwhile.
* Comments on records other than shared notes.
* Notification preferences, mentions and unread counts.

## 10. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `409` "already a member" / "pending invitation" | Revoke the old invitation or change the member's role instead |
| Accept returns `403` | Signed in with a different email than the invited one |
| Accept/preview returns `404` | Token mistyped, already used, revoked or expired; ask for a new invitation |
| `409` on note save with `current` | Someone saved first; merge with `current` and retry with its `version` |
| Realtime `CHANNEL_ERROR` | Not a member, the token expired (call `/realtime/token` again), or `config.private` is missing |
| No Realtime messages locally | Check `npm run supabase:status` (Realtime must be running); messages are sent only for committed changes |
