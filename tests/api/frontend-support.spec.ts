import { expect, test } from "@playwright/test";

import { createUser, deleteUsers, ws, type TestUser } from "./helpers";

// Endpoints and views added in Phase 7 for loading a whole workspace into the client.
let user: TestUser;
let outsider: TestUser;

test.beforeAll(async () => {
  [user, outsider] = await Promise.all([createUser("loader"), createUser("loader-outsider")]);
});
test.afterAll(async () => deleteUsers([user, outsider]));

test("calls list returns full records with view=detail", async () => {
  const created = await user.api.post(ws(user, "/calls"), {
    data: {
      opportunity: { create: { company: { name: "Fictional Harbor" }, title: "SRE", workMode: "remote", employmentType: "full_time" } },
      callAt: "2026-10-20T15:00:00Z",
      durationMinutes: 30,
      interestLevel: 6,
      notes: "[Fictional] Detail view notes",
      candidateQuestions: [{ question: "Team size?", answer: "6" }],
    },
  });
  expect(created.status()).toBe(201);
  const summary = await (await user.api.get(ws(user, "/calls"))).json();
  expect(summary.data[0]).not.toHaveProperty("notes");
  const detail = await (await user.api.get(ws(user, "/calls?view=detail"))).json();
  expect(detail.data[0]).toMatchObject({ notes: "[Fictional] Detail view notes", candidateQuestions: [{ question: "Team size?", answer: "6" }] });
  expect((await user.api.get(ws(user, "/calls?view=everything"))).status()).toBe(400);
});

test("workspace-wide recordings, comments and detailed notes lists are member-only", async () => {
  const note = await (await user.api.post(ws(user, "/notes"), { data: { title: "Loader note", body: "Body text" } })).json();
  await user.api.post(ws(user, `/notes/${note.id}/comments`), { data: { body: "First" } });

  const notes = await (await user.api.get(ws(user, "/notes?view=detail"))).json();
  expect(notes.data[0]).toMatchObject({ id: note.id, body: "Body text" });
  const comments = await (await user.api.get(ws(user, "/comments"))).json();
  expect(comments.data.map((c: { body: string }) => c.body)).toEqual(["First"]);
  expect((await (await user.api.get(ws(user, `/comments?noteId=${note.id}`))).json()).data).toHaveLength(1);
  const recordings = await (await user.api.get(ws(user, "/recordings"))).json();
  expect(recordings.data).toEqual([]);

  for (const path of ["/notes?view=detail", "/comments", "/recordings"]) {
    expect((await outsider.api.get(`/api/v1/workspaces/${user.workspaceId}${path}`)).status(), path).toBe(404);
  }
});
