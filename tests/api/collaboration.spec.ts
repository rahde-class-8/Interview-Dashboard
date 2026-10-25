import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { admin, createUser, deleteUsers, ws, type TestUser } from "./helpers";

let owner: TestUser;
let editor: TestUser;
let commenter: TestUser;
let viewer: TestUser;
let outsider: TestUser;

/** Invites `user` with `role` through the API and accepts as them. */
async function join(user: TestUser, role: "editor" | "commenter" | "viewer") {
  const created = await owner.api.post(ws(owner, "/invitations"), { data: { email: user.email, role } });
  expect(created.status(), await created.text()).toBe(201);
  const { token } = await created.json();
  const accepted = await user.api.post("/api/v1/invitations/accept", { data: { token } });
  expect(accepted.status()).toBe(200);
}

test.beforeAll(async () => {
  [owner, editor, commenter, viewer, outsider] = await Promise.all([
    createUser("collab-owner"),
    createUser("collab-editor"),
    createUser("collab-commenter"),
    createUser("collab-viewer"),
    createUser("collab-outsider"),
  ]);
});
test.afterAll(async () => deleteUsers([owner, editor, commenter, viewer, outsider]));

const shared = (user: TestUser, path = "") => `/api/v1/workspaces/${owner.workspaceId}${path}`;

test("owners invite collaborators by link; invitations are single-use and bound to the email", async () => {
  expect((await outsider.api.post(shared(outsider, "/invitations"), { data: { email: "x@example.com", role: "viewer" } })).status()).toBe(404);
  expect((await owner.api.post(ws(owner, "/invitations"), { data: { email: "bad", role: "viewer" } })).status()).toBe(400);
  expect((await owner.api.post(ws(owner, "/invitations"), { data: { email: editor.email, role: "owner" } })).status()).toBe(400);

  const created = await owner.api.post(ws(owner, "/invitations"), { data: { email: editor.email.toUpperCase(), role: "editor" } });
  expect(created.status()).toBe(201);
  const { invitation, inviteUrl, token } = await created.json();
  expect(invitation).toMatchObject({ email: editor.email, role: "editor", status: "pending", invitedBy: owner.id });
  expect(inviteUrl).toBe(`http://localhost:3000/invite/${token}`);
  expect(token.length).toBeGreaterThanOrEqual(43);
  const { data: stored } = await admin.from("workspace_invitations").select("token_hash").eq("id", invitation.id).single();
  expect(String(stored?.token_hash)).not.toContain(token); // only the hash is stored

  const duplicate = await owner.api.post(ws(owner, "/invitations"), { data: { email: editor.email, role: "viewer" } });
  expect(duplicate.status()).toBe(409);
  const list = await (await owner.api.get(ws(owner, "/invitations"))).json();
  expect(list.data.map((i: { id: string }) => i.id)).toContain(invitation.id);

  // Preview: workspace name and role only; the wrong account is told the email differs.
  const preview = await (await editor.api.post("/api/v1/invitations/preview", { data: { token } })).json();
  expect(preview).toMatchObject({ role: "editor", emailMatches: true, invitedByName: "collab-owner" });
  expect((await (await outsider.api.post("/api/v1/invitations/preview", { data: { token } })).json()).emailMatches).toBe(false);
  expect((await outsider.api.post("/api/v1/invitations/accept", { data: { token } })).status()).toBe(403);
  expect((await outsider.api.post("/api/v1/invitations/accept", { data: { token: "x".repeat(43) } })).status()).toBe(404);

  const accepted = await editor.api.post("/api/v1/invitations/accept", { data: { token } });
  expect(accepted.status()).toBe(200);
  expect(await accepted.json()).toEqual({ workspaceId: owner.workspaceId, role: "editor" });
  expect((await editor.api.post("/api/v1/invitations/accept", { data: { token } })).status()).toBe(404);
  expect((await editor.api.get(shared(editor))).status()).toBe(200);

  // Only owners invite; members cannot be invited again; non-owners cannot list invitations.
  expect((await editor.api.post(shared(editor, "/invitations"), { data: { email: "x@example.com", role: "viewer" } })).status()).toBe(403);
  expect((await owner.api.post(ws(owner, "/invitations"), { data: { email: editor.email, role: "viewer" } })).status()).toBe(409);
  expect((await editor.api.get(shared(editor, "/invitations"))).status()).toBe(403);
});

test("revoked and expired invitations cannot be used", async () => {
  const revoked = await (await owner.api.post(ws(owner, "/invitations"), { data: { email: outsider.email, role: "viewer" } })).json();
  expect((await owner.api.delete(ws(owner, `/invitations/${revoked.invitation.id}`))).status()).toBe(204);
  expect((await owner.api.delete(ws(owner, `/invitations/${revoked.invitation.id}`))).status()).toBe(409);
  expect((await outsider.api.post("/api/v1/invitations/accept", { data: { token: revoked.token } })).status()).toBe(404);

  const expired = await (await owner.api.post(ws(owner, "/invitations"), { data: { email: outsider.email, role: "viewer" } })).json();
  await admin.from("workspace_invitations").update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", expired.invitation.id);
  expect((await outsider.api.post("/api/v1/invitations/preview", { data: { token: expired.token } })).status()).toBe(404);
  expect((await outsider.api.post("/api/v1/invitations/accept", { data: { token: expired.token } })).status()).toBe(404);
  const all = await (await owner.api.get(ws(owner, "/invitations?status=all"))).json();
  expect(all.data.find((i: { id: string }) => i.id === expired.invitation.id).status).toBe("expired");
  expect((await outsider.api.get(shared(outsider))).status()).toBe(404);
});

test("owners assign and change roles and remove members; members can leave", async () => {
  await join(commenter, "commenter");
  await join(viewer, "viewer");

  const members = await (await viewer.api.get(shared(viewer, "/members"))).json();
  expect(members.data[0]).toMatchObject({ userId: owner.id, role: "owner" });
  expect(members.data.find((m: { userId: string }) => m.userId === viewer.id)).toMatchObject({ role: "viewer", isYou: true });

  expect((await editor.api.patch(shared(editor, `/members/${viewer.id}`), { data: { role: "editor" } })).status()).toBe(403);
  expect((await owner.api.patch(ws(owner, `/members/${viewer.id}`), { data: { role: "owner" } })).status()).toBe(400);
  expect((await owner.api.patch(ws(owner, `/members/${owner.id}`), { data: { role: "viewer" } })).status()).toBe(409);
  const promoted = await owner.api.patch(ws(owner, `/members/${viewer.id}`), { data: { role: "commenter" } });
  expect((await promoted.json()).role).toBe("commenter");
  // The new role takes effect immediately.
  const note = await (await owner.api.post(ws(owner, "/notes"), { data: { title: "Role check" } })).json();
  expect((await viewer.api.post(shared(viewer, `/notes/${note.id}/comments`), { data: { body: "Now I can comment" } })).status()).toBe(201);
  await owner.api.patch(ws(owner, `/members/${viewer.id}`), { data: { role: "viewer" } });
  expect((await viewer.api.post(shared(viewer, `/notes/${note.id}/comments`), { data: { body: "Not any more" } })).status()).toBe(403);

  expect((await commenter.api.delete(shared(commenter, `/members/${viewer.id}`))).status()).toBe(403);
  expect((await owner.api.delete(ws(owner, `/members/${owner.id}`))).status()).toBe(409);

  // Removal and leaving revoke access immediately.
  expect((await owner.api.delete(ws(owner, `/members/${viewer.id}`))).status()).toBe(204);
  expect((await viewer.api.get(shared(viewer, `/notes/${note.id}`))).status()).toBe(404);
  await join(viewer, "viewer");
  expect((await viewer.api.delete(shared(viewer, `/members/${viewer.id}`))).status()).toBe(204);
  expect((await viewer.api.get(shared(viewer))).status()).toBe(404);
  await join(viewer, "viewer");
});

test("shared notes reject stale updates instead of overwriting", async () => {
  const created = await editor.api.post(shared(editor, "/notes"), { data: { title: "Interview plan", body: "Draft" } });
  expect(created.status()).toBe(201);
  const note = await created.json();
  expect(note).toMatchObject({ version: 1, updatedBy: { id: editor.id } });
  expect((await viewer.api.post(shared(viewer, "/notes"), { data: { title: "x" } })).status()).toBe(403);
  expect((await commenter.api.patch(shared(commenter, `/notes/${note.id}`), { data: { body: "x", version: 1 } })).status()).toBe(403);

  const first = await owner.api.patch(ws(owner, `/notes/${note.id}`), { data: { body: "Owner edit", version: 1 } });
  expect((await first.json()).version).toBe(2);
  const stale = await editor.api.patch(shared(editor, `/notes/${note.id}`), { data: { body: "Editor edit", version: 1 } });
  expect(stale.status()).toBe(409);
  const conflict = await stale.json();
  expect(conflict.error.code).toBe("conflict");
  expect(conflict.current).toMatchObject({ body: "Owner edit", version: 2, updatedBy: { id: owner.id } });
  const retried = await editor.api.patch(shared(editor, `/notes/${note.id}`), { data: { body: "Owner edit + editor edit", version: 2 } });
  expect((await retried.json()).version).toBe(3);
  expect((await editor.api.patch(shared(editor, `/notes/${note.id}`), { data: { version: 3 } })).status()).toBe(400);

  const list = await (await viewer.api.get(shared(viewer, "/notes"))).json();
  expect(list.data.find((n: { id: string }) => n.id === note.id)).not.toHaveProperty("body");
});

test("comments: commenters add, authors edit, authors and owners delete", async () => {
  const note = await (await editor.api.post(shared(editor, "/notes"), { data: { title: "Comment thread" } })).json();
  const path = shared(commenter, `/notes/${note.id}/comments`);

  expect((await viewer.api.post(path, { data: { body: "Hi" } })).status()).toBe(403);
  expect((await commenter.api.post(path, { data: { body: "   " } })).status()).toBe(400);
  const comment = await (await commenter.api.post(path, { data: { body: "Ask about on-call" } })).json();
  expect(comment).toMatchObject({ body: "Ask about on-call", author: { id: commenter.id }, deleted: false, editedAt: null });

  expect((await editor.api.patch(shared(editor, `/comments/${comment.id}`), { data: { body: "Hijack" } })).status()).toBe(403);
  expect((await owner.api.patch(ws(owner, `/comments/${comment.id}`), { data: { body: "Hijack" } })).status()).toBe(403);
  const edited = await (await commenter.api.patch(shared(commenter, `/comments/${comment.id}`), { data: { body: "Ask about on-call rotation" } })).json();
  expect(edited.editedAt).toBeTruthy();

  expect((await editor.api.delete(shared(editor, `/comments/${comment.id}`))).status()).toBe(403);
  expect((await owner.api.delete(ws(owner, `/comments/${comment.id}`))).status()).toBe(204);
  const thread = await (await viewer.api.get(path)).json();
  expect(thread.data).toEqual([expect.objectContaining({ id: comment.id, deleted: true, body: null })]);
  expect((await commenter.api.patch(shared(commenter, `/comments/${comment.id}`), { data: { body: "Back" } })).status()).toBe(409);
  expect((await outsider.api.get(`/api/v1/workspaces/${owner.workspaceId}/notes/${note.id}/comments`)).status()).toBe(404);
});

test("important changes appear in the activity log for members only", async () => {
  const created = await editor.api.post(shared(editor, "/calls"), {
    data: {
      opportunity: { create: { company: { name: "Bluewater Logistics" }, title: "Site Reliability Engineer", workMode: "remote", employmentType: "full_time" } },
      callAt: "2026-10-22T16:00:00Z",
      durationMinutes: 20,
      interestLevel: 6,
      notes: "Private fictional notes: salary expectations",
    },
  });
  const call = await created.json();
  await editor.api.put(shared(editor, `/opportunities/${call.opportunity.id}/stage`), { data: { stage: "technical" } });

  const res = await viewer.api.get(shared(viewer, "/activity?limit=50"));
  expect(res.status()).toBe(200);
  const events = (await res.json()).data as { action: string; summary: string; metadata: object; actor: { id: string } | null }[];
  const summaries = events.map((e) => e.summary);
  expect(summaries).toContain("collab-editor moved “Site Reliability Engineer” at Bluewater Logistics from Recruiter screen to Technical");
  expect(summaries).toContain("collab-editor logged a recruiter call for “Site Reliability Engineer” at Bluewater Logistics");
  expect(summaries).toContain("collab-owner removed collab-viewer from the workspace");
  expect(summaries).toContain("collab-viewer joined as viewer");
  expect(events.some((e) => e.action === "comment.deleted")).toBe(true);
  expect(JSON.stringify(events)).not.toContain("salary expectations");
  expect(JSON.stringify(events)).not.toContain("@example.com");

  const filtered = await (await viewer.api.get(shared(viewer, `/activity?entityType=opportunity&entityId=${call.opportunity.id}`))).json();
  expect(filtered.data.map((e: { action: string }) => e.action)).toEqual(["opportunity.stage_changed", "opportunity.created"]);
  expect((await outsider.api.get(`/api/v1/workspaces/${owner.workspaceId}/activity`)).status()).toBe(404);
});

// --- Realtime ---------------------------------------------------------------------------

async function realtimeClient(user: TestUser) {
  const res = await user.api.get("/api/v1/realtime/token");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toBe("no-store");
  const { accessToken, expiresAt } = await res.json();
  expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.realtime.setAuth(accessToken);
  return client;
}

function subscribe(client: Awaited<ReturnType<typeof realtimeClient>>, topic: string) {
  const received: { table: string; op: string; recordId: string; workspaceId: string }[] = [];
  const channel: RealtimeChannel = client.channel(topic, { config: { private: true } });
  channel.on("broadcast", { event: "change" }, (message) => received.push(message.payload as (typeof received)[number]));
  const status = new Promise<string>((resolve) => {
    channel.subscribe((s) => {
      if (s !== "CLOSED") resolve(s);
    });
    setTimeout(() => resolve("TIMED_OUT"), 10_000);
  });
  return { channel, received, status };
}

async function waitFor<T>(check: () => T | undefined, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for a Realtime message");
    await new Promise((r) => setTimeout(r, 100));
  }
}

test("Realtime: members receive change notifications (ids only); others cannot join", async ({ request }) => {
  expect((await request.get("/api/v1/realtime/token")).status()).toBe(401);

  const topic = `workspace:${owner.workspaceId}`;
  const viewerClient = await realtimeClient(viewer);
  const outsiderClient = await realtimeClient(outsider);
  const member = subscribe(viewerClient, topic);
  const intruder = subscribe(outsiderClient, topic);
  expect(await member.status).toBe("SUBSCRIBED");
  expect(await intruder.status).toBe("CHANNEL_ERROR");

  const note = await (await editor.api.post(shared(editor, "/notes"), { data: { title: "Realtime note", body: "Secret body text" } })).json();
  const change = await waitFor(() => member.received.find((m) => m.table === "shared_notes" && m.recordId === note.id));
  expect(change).toEqual({ table: "shared_notes", op: "INSERT", recordId: note.id, workspaceId: owner.workspaceId, id: expect.any(String) });
  await waitFor(() => member.received.find((m) => m.table === "activity_events"));
  expect(JSON.stringify(member.received)).not.toContain("Secret body text");
  expect(JSON.stringify(member.received)).not.toContain("Realtime note");
  expect(intruder.received).toEqual([]);

  // Clients cannot publish into a workspace topic: another member never sees a forged message.
  const editorClient = await realtimeClient(editor);
  const listener = subscribe(editorClient, topic);
  expect(await listener.status).toBe("SUBSCRIBED");
  await member.channel.send({ type: "broadcast", event: "change", payload: { table: "forged" } });
  await new Promise((r) => setTimeout(r, 1500));
  expect(listener.received.some((m) => m.table === "forged")).toBe(false);
  await editorClient.removeAllChannels();

  // After removal, the former member can no longer join.
  await viewerClient.removeAllChannels();
  expect((await owner.api.delete(ws(owner, `/members/${viewer.id}`))).status()).toBe(204);
  const rejoin = subscribe(await realtimeClient(viewer), topic);
  expect(await rejoin.status).toBe("CHANNEL_ERROR");

  await outsiderClient.removeAllChannels();
});
