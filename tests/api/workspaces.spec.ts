import { expect, test } from "@playwright/test";

import { addMember, createUser, deleteUsers, type TestUser } from "./helpers";

let owner: TestUser;
let editor: TestUser;

test.beforeAll(async () => {
  [owner, editor] = await Promise.all([createUser("ws-owner"), createUser("ws-editor")]);
  await addMember(owner.workspaceId, editor.id, "editor");
});
test.afterAll(async () => deleteUsers([owner, editor]));

test("lists workspaces with the caller's role", async () => {
  const body = await (await editor.api.get("/api/v1/workspaces")).json();
  const roles = Object.fromEntries(body.data.map((w: { id: string; role: string }) => [w.id, w.role]));
  expect(roles[editor.workspaceId]).toBe("owner");
  expect(roles[owner.workspaceId]).toBe("editor");
});

test("creates, renames and deletes a workspace", async () => {
  const created = await owner.api.post("/api/v1/workspaces", { data: { name: "Side search" } });
  expect(created.status()).toBe(201);
  const workspace = await created.json();
  expect(workspace).toMatchObject({ name: "Side search", role: "owner", ownerId: owner.id, recordingRetentionDays: null });

  const renamed = await owner.api.patch(`/api/v1/workspaces/${workspace.id}`, { data: { name: "Renamed", recordingRetentionDays: 90 } });
  expect(await renamed.json()).toMatchObject({ name: "Renamed", recordingRetentionDays: 90 });

  const wrongConfirm = await owner.api.delete(`/api/v1/workspaces/${workspace.id}`, { data: { confirmName: "Side search" } });
  expect(wrongConfirm.status()).toBe(400);

  const deleted = await owner.api.delete(`/api/v1/workspaces/${workspace.id}`, { data: { confirmName: "Renamed" } });
  expect(deleted.status()).toBe(204);
  expect((await owner.api.get(`/api/v1/workspaces/${workspace.id}`)).status()).toBe(404);
});

test("only owners can change or delete a workspace", async () => {
  expect((await editor.api.get(`/api/v1/workspaces/${owner.workspaceId}`)).status()).toBe(200);
  expect((await editor.api.patch(`/api/v1/workspaces/${owner.workspaceId}`, { data: { name: "Mine now" } })).status()).toBe(403);
  const del = await editor.api.delete(`/api/v1/workspaces/${owner.workspaceId}`, { data: { confirmName: "x" } });
  expect(del.status()).toBe(403);
});

test("rejects invalid retention values", async () => {
  const res = await owner.api.patch(`/api/v1/workspaces/${owner.workspaceId}`, { data: { recordingRetentionDays: 45 } });
  expect(res.status()).toBe(400);
});
