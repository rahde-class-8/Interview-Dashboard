import { expect, request, test } from "@playwright/test";

import { BASE_URL, addMember, createUser, deleteUsers, ws, type TestUser } from "./helpers";

let owner: TestUser;
let viewer: TestUser;
let outsider: TestUser;

test.beforeAll(async () => {
  [owner, viewer, outsider] = await Promise.all([createUser("owner"), createUser("viewer"), createUser("outsider")]);
  await addMember(owner.workspaceId, viewer.id, "viewer");
});
test.afterAll(async () => deleteUsers([owner, viewer, outsider]));

test("unauthenticated requests get a JSON 401 with request id and no-store", async () => {
  const anon = await request.newContext({ baseURL: BASE_URL });
  const res = await anon.get("/api/v1/me");
  expect(res.status()).toBe(401);
  const body = await res.json();
  expect(body.error.code).toBe("unauthenticated");
  expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/);
  expect(res.headers()["x-request-id"]).toBe(body.error.requestId);
  expect(res.headers()["cache-control"]).toBe("no-store");
  await anon.dispose();
});

test("GET /me returns the signed-in profile", async () => {
  const res = await owner.api.get("/api/v1/me");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ id: owner.id, email: owner.email, displayName: "owner", headline: null });
});

test("PATCH /me updates display fields only", async () => {
  const res = await owner.api.patch("/api/v1/me", { data: { displayName: "Owner Person", headline: "Cloud engineer" } });
  expect(await res.json()).toMatchObject({ displayName: "Owner Person", headline: "Cloud engineer" });
  const bad = await owner.api.patch("/api/v1/me", { data: { email: "x@example.com" } });
  expect(bad.status()).toBe(400);
});

test("non-members get 404 for another workspace (no existence leak)", async () => {
  const res = await outsider.api.get(ws(owner, "/companies"));
  expect(res.status()).toBe(404);
  expect((await res.json()).error.code).toBe("not_found");
  const write = await outsider.api.post(ws(owner, "/companies"), { data: { name: "Intruder" } });
  expect(write.status()).toBe(404);
});

test("viewers can read but not write", async () => {
  const created = await owner.api.post(ws(owner, "/companies"), { data: { name: "Visible Co" } });
  expect(created.status()).toBe(201);
  const list = await viewer.api.get(ws(owner, "/companies"));
  expect(list.status()).toBe(200);
  expect((await list.json()).data.map((c: { name: string }) => c.name)).toContain("Visible Co");
  const write = await viewer.api.post(ws(owner, "/companies"), { data: { name: "Viewer Co" } });
  expect(write.status()).toBe(403);
  expect((await write.json()).error.code).toBe("forbidden");
});

test("malformed ids are reported as not found", async () => {
  expect((await owner.api.get("/api/v1/workspaces/not-a-uuid/companies")).status()).toBe(404);
  expect((await owner.api.get(ws(owner, "/companies/not-a-uuid"))).status()).toBe(404);
  expect((await owner.api.get(ws(owner, "/companies/00000000-0000-0000-0000-000000000000"))).status()).toBe(404);
});

test("mutations must be JSON and same-origin, with a size limit", async () => {
  const textPlain = await owner.api.post(ws(owner, "/companies"), {
    headers: { "content-type": "text/plain" },
    data: '{"name":"Sneaky"}',
  });
  expect(textPlain.status()).toBe(415);

  const crossOrigin = await owner.api.post(ws(owner, "/companies"), {
    headers: { origin: "https://evil.example.com" },
    data: { name: "Cross" },
  });
  expect(crossOrigin.status()).toBe(403);

  const huge = await owner.api.post(ws(owner, "/star-stories"), { data: { title: "x", situation: "a".repeat(1_100_000) } });
  expect(huge.status()).toBe(413);

  const invalidJson = await owner.api.post(ws(owner, "/companies"), {
    headers: { "content-type": "application/json" },
    data: Buffer.from("{not json"),
  });
  expect(invalidJson.status()).toBe(400);
  expect((await invalidJson.json()).error.code).toBe("invalid_json");
});

test("validation errors list each invalid field", async () => {
  const res = await owner.api.post(ws(owner, "/companies"), { data: { name: "", website: "ftp://nope" } });
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("validation_failed");
  expect(body.error.details.map((d: { path: string }) => d.path).sort()).toEqual(["name", "website"]);
});

test("search input cannot alter filter syntax", async () => {
  // A recruiter exists, so any payload that broadened the filter would return it.
  expect((await owner.api.post(ws(owner, "/recruiters"), { data: { name: "Dana Whitfield" } })).status()).toBe(201);
  expect((await (await owner.api.get(ws(owner, "/recruiters?q=dana"))).json()).data).toHaveLength(1);
  for (const q of [",id.not.is.null)", 'x"),or(name.neq.', "%", "_", "\\"]) {
    const res = await owner.api.get(ws(owner, `/recruiters?q=${encodeURIComponent(q)}`));
    expect(res.status(), q).toBe(200);
    expect((await res.json()).data, q).toEqual([]);
  }
});
