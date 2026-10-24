import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { PASSWORD, addMember, admin, createUser, deleteUsers, ws, type TestUser } from "./helpers";

// Fictional fixture audio: valid signatures followed by padding.
const MP3 = Buffer.concat([Buffer.from("ID3\x04\x00\x00\x00\x00\x00\x00", "latin1"), Buffer.alloc(2048, 0x55)]);
const M4A = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from("ftypM4A \0\0\0\0", "latin1"), Buffer.alloc(1024)]);
const WAV = Buffer.concat([Buffer.from("RIFF\x24\x00\x00\x00WAVEfmt ", "latin1"), Buffer.alloc(1024)]);
const NOT_AUDIO = Buffer.from("This is a text file pretending to be an MP3.".repeat(20));

const publicClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

interface UploadTarget {
  signedUrl: string;
  token: string;
  path: string;
  contentType: string;
}

/** Uploads like a browser would: directly to Storage with the one-time token. */
async function upload(target: UploadTarget, body: Buffer, contentType = target.contentType) {
  return publicClient().storage.from("recordings").uploadToSignedUrl(target.path, target.token, body, { contentType });
}

async function objectExists(path: string) {
  const { data } = await admin.storage.from("recordings").exists(path);
  return data;
}

let owner: TestUser;
let editor: TestUser;
let commenter: TestUser;
let viewer: TestUser;
let outsider: TestUser;
let callId: string;

test.beforeAll(async () => {
  [owner, editor, commenter, viewer, outsider] = await Promise.all([
    createUser("rec-owner"),
    createUser("rec-editor"),
    createUser("rec-commenter"),
    createUser("rec-viewer"),
    createUser("rec-outsider"),
  ]);
  await addMember(owner.workspaceId, editor.id, "editor");
  await addMember(owner.workspaceId, commenter.id, "commenter");
  await addMember(owner.workspaceId, viewer.id, "viewer");
  for (const member of [editor, commenter, viewer]) member.workspaceId = owner.workspaceId;

  const res = await owner.api.post(ws(owner, "/calls"), {
    data: {
      opportunity: { create: { company: { name: "Harborline Data" }, title: "Platform Engineer", workMode: "remote", employmentType: "full_time" } },
      callAt: "2026-10-20T15:00:00Z",
      durationMinutes: 30,
      interestLevel: 7,
    },
  });
  expect(res.status()).toBe(201);
  callId = (await res.json()).id;
});
test.afterAll(async () => deleteUsers([owner, editor, commenter, viewer, outsider]));

const recordingsOf = (user: TestUser) => ws(user, `/calls/${callId}/recordings`);
const recording = (user: TestUser, id: string, path = "") => ws(user, `/recordings/${id}${path}`);

async function startUpload(user: TestUser, fileName: string, fileSize: number, mimeType = "") {
  const res = await user.api.post(recordingsOf(user), { data: { fileName, fileSize, mimeType, consentConfirmed: true } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { recording: { id: string; status: string; mimeType: string }; upload: UploadTarget };
}

test("uploads, verifies, plays back and deletes a recording", async () => {
  const { recording: created, upload: target } = await startUpload(editor, "Harborline screen.mp3", MP3.length, "audio/mpeg");
  expect(created).toMatchObject({ status: "pending", mimeType: "audio/mpeg", fileName: "Harborline screen.mp3", uploadedBy: editor.id });
  // The server chooses the object path; the user's file name never reaches Storage.
  expect(target.path).toBe(`${owner.workspaceId}/${callId}/${created.id}.mp3`);
  expect(target.signedUrl).toContain("/storage/v1/object/upload/sign/recordings/");

  expect((await upload(target, MP3)).error).toBeNull();
  const done = await editor.api.post(recording(editor, created.id, "/complete"), { data: { durationSeconds: 1800 } });
  expect(done.status()).toBe(200);
  const uploaded = await done.json();
  expect(uploaded).toMatchObject({ status: "uploaded", durationSeconds: 1800, deleteAfter: null });
  expect(uploaded.uploadedAt).toBeTruthy();

  // Completing again is a harmless no-op.
  expect((await editor.api.post(recording(editor, created.id, "/complete"), { data: {} })).status()).toBe(200);

  const call = await (await viewer.api.get(ws(viewer, `/calls/${callId}`))).json();
  expect(call.recordingCount).toBe(1);
  const list = await (await viewer.api.get(recordingsOf(viewer))).json();
  expect(list.data.map((r: { id: string }) => r.id)).toContain(created.id);

  const play = await owner.api.get(recording(owner, created.id, "/playback-url"));
  expect(play.status()).toBe(200);
  expect(play.headers()["cache-control"]).toBe("no-store");
  const { url, expiresAt } = await play.json();
  const ttl = new Date(expiresAt).getTime() - Date.now();
  expect(ttl).toBeGreaterThan(4 * 60_000);
  expect(ttl).toBeLessThanOrEqual(5 * 60_000);
  const audio = await fetch(url);
  expect(audio.status).toBe(200);
  expect(Buffer.from(await audio.arrayBuffer()).equals(MP3)).toBe(true);

  // The upload token cannot be reused to replace the verified file.
  expect((await upload(target, NOT_AUDIO, "audio/mpeg")).error).not.toBeNull();

  expect((await editor.api.delete(recording(editor, created.id))).status()).toBe(204);
  expect(await objectExists(target.path)).toBe(false);
  expect((await editor.api.get(recording(editor, created.id))).status()).toBe(404);
  expect((await owner.api.get(recording(owner, created.id, "/playback-url"))).status()).toBe(404);
  const { data: queue } = await admin.from("storage_cleanup_queue").select("reason, completed_at").eq("storage_path", target.path);
  expect(queue).toEqual([expect.objectContaining({ reason: "user_delete", completed_at: expect.any(String) })]);
  const after = await (await viewer.api.get(ws(viewer, `/calls/${callId}`))).json();
  expect(after.recordingCount).toBe(0);
});

test("accepts M4A and WAV and normalizes browser MIME aliases", async () => {
  for (const [fileName, body, mimeType, expected] of [
    ["voice memo.m4a", M4A, "audio/x-m4a", "audio/mp4"],
    ["export.WAV", WAV, "audio/x-wav", "audio/wav"],
    ["no-type.mp3", MP3, "", "audio/mpeg"],
  ] as const) {
    const { recording: created, upload: target } = await startUpload(owner, fileName, body.length, mimeType);
    expect(target.contentType).toBe(expected);
    expect((await upload(target, body)).error).toBeNull();
    const res = await owner.api.post(recording(owner, created.id, "/complete"), { data: {} });
    expect(res.status(), fileName).toBe(200);
    expect((await owner.api.delete(recording(owner, created.id))).status()).toBe(204);
  }
});

test("rejects unsupported, oversized and unconsented uploads before issuing a URL", async () => {
  const post = (data: object) => owner.api.post(recordingsOf(owner), { data });
  const base = { fileName: "call.mp3", fileSize: 1000, consentConfirmed: true };

  expect((await post({ ...base, fileName: "call.ogg" })).status()).toBe(400);
  expect((await post({ ...base, fileName: "call.exe" })).status()).toBe(400);
  const mismatch = await post({ ...base, mimeType: "video/mp4" });
  expect(mismatch.status()).toBe(400);
  expect((await mismatch.json()).error.details[0].path).toBe("mimeType");
  expect((await post({ ...base, consentConfirmed: false })).status()).toBe(400);
  expect((await post({ fileName: "call.mp3", fileSize: 1000 })).status()).toBe(400);
  expect((await post({ ...base, fileSize: 0 })).status()).toBe(400);
  const tooBig = await post({ ...base, fileSize: 100 * 1024 * 1024 + 1 });
  expect(tooBig.status()).toBe(413);
  expect((await tooBig.json()).error.code).toBe("payload_too_large");

  const { count } = await admin.from("recordings").select("id", { count: "exact", head: true }).eq("workspace_id", owner.workspaceId).eq("status", "pending");
  expect(count).toBe(0);
});

test("enforces workspace roles for uploads, playback and deletion", async () => {
  for (const user of [commenter, viewer]) {
    const res = await user.api.post(recordingsOf(user), { data: { fileName: "x.mp3", fileSize: 10, consentConfirmed: true } });
    expect(res.status()).toBe(403);
  }
  const foreign = await outsider.api.post(`/api/v1/workspaces/${owner.workspaceId}/calls/${callId}/recordings`, {
    data: { fileName: "x.mp3", fileSize: 10, consentConfirmed: true },
  });
  expect(foreign.status()).toBe(404);

  const { recording: created, upload: target } = await startUpload(owner, "owner.mp3", MP3.length);
  await upload(target, MP3);
  expect((await owner.api.post(recording(owner, created.id, "/complete"), { data: {} })).status()).toBe(200);

  // Members can see the metadata, but only owners and editors can play it (D4).
  expect((await viewer.api.get(recording(viewer, created.id))).status()).toBe(200);
  expect((await viewer.api.get(recording(viewer, created.id, "/playback-url"))).status()).toBe(403);
  expect((await commenter.api.get(recording(commenter, created.id, "/playback-url"))).status()).toBe(403);
  expect((await editor.api.get(recording(editor, created.id, "/playback-url"))).status()).toBe(200);
  expect((await outsider.api.get(`/api/v1/workspaces/${owner.workspaceId}/recordings/${created.id}`)).status()).toBe(404);
  expect((await outsider.api.get(`/api/v1/workspaces/${owner.workspaceId}/recordings/${created.id}/playback-url`)).status()).toBe(404);

  // Only the uploader can finish someone's upload; an editor cannot delete another member's recording.
  expect((await editor.api.post(recording(editor, created.id, "/complete"), { data: {} })).status()).toBe(403);
  expect((await editor.api.delete(recording(editor, created.id))).status()).toBe(403);
  expect((await viewer.api.delete(recording(viewer, created.id))).status()).toBe(403);
  expect((await viewer.api.patch(recording(viewer, created.id), { data: { durationSeconds: 5 } })).status()).toBe(403);
  const patched = await editor.api.patch(recording(editor, created.id), { data: { durationSeconds: 95 } });
  expect((await patched.json()).durationSeconds).toBe(95);
  expect((await owner.api.delete(recording(owner, created.id))).status()).toBe(204);
});

test("Storage itself refuses direct access without a server-signed URL", async () => {
  const { recording: created, upload: target } = await startUpload(owner, "private.mp3", MP3.length);
  await upload(target, MP3);
  await owner.api.post(recording(owner, created.id, "/complete"), { data: {} });

  // Signed in as the workspace owner, with the publishable key: still no access.
  const client = publicClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email: owner.email, password: PASSWORD });
  expect(signInError).toBeNull();
  const bucket = client.storage.from("recordings");
  expect((await bucket.download(target.path)).error).not.toBeNull();
  expect((await bucket.list(`${owner.workspaceId}/${callId}`)).data ?? []).toEqual([]);
  expect((await bucket.createSignedUrl(target.path, 60)).error).not.toBeNull();
  expect((await bucket.upload(`${owner.workspaceId}/${callId}/sneaky.mp3`, MP3, { contentType: "audio/mpeg" })).error).not.toBeNull();
  expect((await bucket.remove([target.path])).data ?? []).toEqual([]);
  expect(await objectExists(target.path)).toBe(true);

  // Public URLs do not work for the private bucket.
  const publicUrl = client.storage.from("recordings").getPublicUrl(target.path).data.publicUrl;
  expect((await fetch(publicUrl)).ok).toBe(false);

  // An upload token is bound to its exact path.
  const other = await startUpload(owner, "other.mp3", MP3.length);
  const misuse = await publicClient().storage.from("recordings").uploadToSignedUrl(`${owner.workspaceId}/${callId}/evil.mp3`, other.upload.token, MP3, {
    contentType: "audio/mpeg",
  });
  expect(misuse.error).not.toBeNull();

  await owner.api.delete(recording(owner, created.id));
  await owner.api.delete(recording(owner, other.recording.id));
});

test("marks invalid uploads failed and removes the object", async () => {
  const cases: [string, Buffer, number, string?][] = [
    ["fake.mp3", NOT_AUDIO, NOT_AUDIO.length], // wrong content
    ["short.mp3", MP3, MP3.length + 10], // size differs from the declaration
    ["wrongtype.mp3", MP3, MP3.length, "audio/wav"], // stored content type differs
  ];
  for (const [fileName, body, declared, contentType] of cases) {
    const { recording: created, upload: target } = await startUpload(owner, fileName, declared);
    expect((await upload(target, body, contentType ?? target.contentType)).error).toBeNull();
    const res = await owner.api.post(recording(owner, created.id, "/complete"), { data: {} });
    expect(res.status(), fileName).toBe(422);
    expect((await res.json()).error.code).toBe("invalid_recording");
    expect(await objectExists(target.path)).toBe(false);
    const row = await (await owner.api.get(recording(owner, created.id))).json();
    expect(row).toMatchObject({ status: "failed" });
    expect(row.failureReason).toBeTruthy();
    expect((await owner.api.get(recording(owner, created.id, "/playback-url"))).status()).toBe(409);
  }
});

test("recovers interrupted uploads with a fresh upload URL", async () => {
  const { recording: created } = await startUpload(editor, "interrupted.wav", WAV.length);

  const early = await editor.api.post(recording(editor, created.id, "/complete"), { data: {} });
  expect(early.status()).toBe(409);
  expect((await early.json()).error.code).toBe("upload_incomplete");
  expect((await owner.api.post(recording(owner, created.id, "/upload-url"), { data: {} })).status()).toBe(403);

  const renewed = await editor.api.post(recording(editor, created.id, "/upload-url"), { data: {} });
  expect(renewed.status()).toBe(200);
  const { upload: target } = await renewed.json();
  expect((await upload(target, WAV)).error).toBeNull();
  expect((await editor.api.post(recording(editor, created.id, "/complete"), { data: {} })).status()).toBe(200);
  expect((await editor.api.post(recording(editor, created.id, "/upload-url"), { data: {} })).status()).toBe(409);
  expect((await editor.api.delete(recording(editor, created.id))).status()).toBe(204);
});

test("applies the workspace quota, retention and rate limits", async () => {
  await admin.from("workspaces").update({ storage_quota_bytes: 5000 }).eq("id", owner.workspaceId);
  const over = await owner.api.post(recordingsOf(owner), { data: { fileName: "big.mp3", fileSize: 6000, consentConfirmed: true } });
  expect(over.status()).toBe(409);
  expect((await over.json()).error.code).toBe("quota_exceeded");
  await admin.from("workspaces").update({ storage_quota_bytes: 2147483648 }).eq("id", owner.workspaceId);

  expect((await owner.api.patch(ws(owner), { data: { recordingRetentionDays: 30 } })).status()).toBe(200);
  const { recording: created, upload: target } = await startUpload(owner, "retained.mp3", MP3.length);
  await upload(target, MP3);
  const done = await (await owner.api.post(recording(owner, created.id, "/complete"), { data: {} })).json();
  const days = (new Date(done.deleteAfter).getTime() - new Date(done.uploadedAt).getTime()) / 86_400_000;
  expect(days).toBe(30);
  await owner.api.patch(ws(owner), { data: { recordingRetentionDays: null } });
  expect((await (await owner.api.get(recording(owner, created.id))).json()).deleteAfter).toBeNull();

  // Exhaust the hourly playback allowance for this user.
  const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
  await admin.from("rate_limit_counters").upsert(
    { subject: owner.id, action: "recording_playback", window_start: windowStart, hits: 120 },
    { onConflict: "subject,action,window_start" },
  );
  const limited = await owner.api.get(recording(owner, created.id, "/playback-url"));
  expect(limited.status()).toBe(429);
  expect((await limited.json()).error.code).toBe("rate_limited");
  await admin.from("rate_limit_counters").delete().eq("subject", owner.id);
  await owner.api.delete(recording(owner, created.id));
});

test("the maintenance job requires the cron secret and purges queued objects", async ({ request }) => {
  const endpoint = "/api/internal/jobs/recording-maintenance";
  expect((await request.post(endpoint)).status()).toBe(401);
  expect((await request.post(endpoint, { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  // A signed-in user's session is not enough.
  expect((await owner.api.post(endpoint)).status()).toBe(401);

  // An object whose removal was deferred (e.g. Storage was unavailable at delete time).
  const path = `${owner.workspaceId}/${callId}/${crypto.randomUUID()}.mp3`;
  await admin.storage.from("recordings").upload(path, MP3, { contentType: "audio/mpeg" });
  await admin.from("storage_cleanup_queue").insert({ workspace_id: owner.workspaceId, bucket: "recordings", storage_path: path, reason: "user_delete" });

  const res = await request.post(endpoint, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(res.status()).toBe(200);
  const result = await res.json();
  expect(result).toMatchObject({ abandoned: expect.any(Number), expired: expect.any(Number), removalFailures: 0 });
  expect(result.objectsRemoved).toBeGreaterThanOrEqual(1);
  expect(await objectExists(path)).toBe(false);
  const { data: entry } = await admin.from("storage_cleanup_queue").select("completed_at").eq("storage_path", path).single();
  expect(entry?.completed_at).toBeTruthy();
});
