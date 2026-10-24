import { expect, test } from "@playwright/test";

import { createUser, deleteUsers, ws, type TestUser } from "./helpers";

let user: TestUser;
let other: TestUser;

test.beforeAll(async () => {
  [user, other] = await Promise.all([createUser("calls"), createUser("calls-other")]);
});
test.afterAll(async () => deleteUsers([user, other]));

const newCall = {
  opportunity: {
    create: { company: { name: "Northwind Cloud Systems" }, title: "AWS Cloud Engineer", workMode: "hybrid", employmentType: "full_time" },
  },
  recruiter: { create: { name: "Dana Whitfield", email: "dana@example.com" } },
  callAt: "2026-10-17T14:00:00Z",
  durationMinutes: 42,
  interestLevel: 8,
  technicalTopics: ["AWS", "Terraform"],
  redFlags: ["Two Sev-1 incidents last quarter"],
  candidateQuestions: [{ question: "What does on-call look like?", answer: "One week in six." }, { question: "Team size?" }],
  notes: "[Fictional sample] Detailed notes.",
  followUp: { title: "Send thank-you email", dueDate: "2026-10-21" },
};

test("creates a call with a new opportunity, recruiter and follow-up in one request", async () => {
  const res = await user.api.post(ws(user, "/calls"), { data: newCall });
  expect(res.status()).toBe(201);
  const call = await res.json();
  expect(call).toMatchObject({
    callAt: "2026-10-17T14:00:00+00:00",
    durationMinutes: 42,
    interestLevel: 8,
    opportunity: { title: "AWS Cloud Engineer", stage: "recruiter_screen", company: { name: "Northwind Cloud Systems" } },
    recruiter: { name: "Dana Whitfield", email: "dana@example.com" },
    followUp: { title: "Send thank-you email", dueDate: "2026-10-21", completed: false },
    candidateQuestions: [
      { question: "What does on-call look like?", answer: "One week in six." },
      { question: "Team size?", answer: "" },
    ],
    recordingCount: 0,
    recruiterAdvice: "",
  });

  const opp = await (await user.api.get(ws(user, `/opportunities/${call.opportunity.id}`))).json();
  expect(opp.recruiter.name).toBe("Dana Whitfield");
});

test("lists call summaries with search and stage filters", async () => {
  await user.api.post(ws(user, "/calls"), {
    data: {
      opportunity: { create: { company: { name: "Lumen Analytics" }, title: "Senior DevOps Engineer", workMode: "remote", employmentType: "contract" } },
      recruiter: { create: { name: "Marcus Bell" } },
      callAt: "2026-10-19T09:30:00Z",
      durationMinutes: 25,
      interestLevel: 6,
    },
  });

  const all = await (await user.api.get(ws(user, "/calls"))).json();
  expect(all.data.map((c: { recruiter: { name: string } }) => c.recruiter.name)).toEqual(["Marcus Bell", "Dana Whitfield"]);
  expect(all.data[0]).not.toHaveProperty("notes");

  for (const [q, expected] of [["marcus", "Marcus Bell"], ["northwind", "Dana Whitfield"], ["devops", "Marcus Bell"]]) {
    const res = await (await user.api.get(ws(user, `/calls?q=${q}`))).json();
    expect(res.data.map((c: { recruiter: { name: string } }) => c.recruiter.name), q).toEqual([expected]);
  }
  expect((await (await user.api.get(ws(user, "/calls?q=nobody"))).json()).data).toEqual([]);

  const screen = await (await user.api.get(ws(user, "/calls?stage=recruiter_screen"))).json();
  expect(screen.data).toHaveLength(2);
  expect((await (await user.api.get(ws(user, "/calls?stage=offer"))).json()).data).toEqual([]);
});

test("partial updates, opportunity edits and follow-up removal", async () => {
  const call = await (await user.api.post(ws(user, "/calls"), { data: newCall })).json();

  const notesOnly = await (await user.api.patch(ws(user, `/calls/${call.id}`), { data: { notes: "Updated" } })).json();
  expect(notesOnly).toMatchObject({ notes: "Updated", interestLevel: 8, technicalTopics: ["AWS", "Terraform"], followUp: { title: "Send thank-you email" } });

  const edited = await (
    await user.api.patch(ws(user, `/calls/${call.id}`), {
      data: { opportunity: { id: call.opportunity.id, update: { title: "Senior AWS Cloud Engineer" } }, followUp: null },
    })
  ).json();
  expect(edited.opportunity.title).toBe("Senior AWS Cloud Engineer");
  expect(edited.followUp).toBeNull();

  const invalid = await user.api.patch(ws(user, `/calls/${call.id}`), { data: { interestLevel: 11 } });
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.details[0].path).toBe("interestLevel");

  expect((await user.api.delete(ws(user, `/calls/${call.id}`))).status()).toBe(204);
  expect((await user.api.get(ws(user, `/calls/${call.id}`))).status()).toBe(404);
});

test("a failed composite save leaves nothing behind", async () => {
  const foreignRecruiter = await (await other.api.post(ws(other, "/recruiters"), { data: { name: "Foreign" } })).json();
  const res = await user.api.post(ws(user, "/calls"), {
    data: {
      ...newCall,
      opportunity: { create: { company: { name: "Rollback Corp" }, title: "Ghost Role", workMode: "remote", employmentType: "full_time" } },
      recruiter: { id: foreignRecruiter.id },
    },
  });
  expect(res.status()).toBe(404);
  const companies = await (await user.api.get(ws(user, "/companies?q=rollback"))).json();
  expect(companies.data).toEqual([]);
  const opps = await (await user.api.get(ws(user, "/opportunities?q=ghost"))).json();
  expect(opps.data).toEqual([]);
});

test("calls require an opportunity and valid fields", async () => {
  const missing = await user.api.post(ws(user, "/calls"), { data: { callAt: "2026-10-17T14:00:00Z", durationMinutes: 10, interestLevel: 5 } });
  expect(missing.status()).toBe(400);
  const badDate = await user.api.post(ws(user, "/calls"), { data: { ...newCall, callAt: "yesterday" } });
  expect(badDate.status()).toBe(400);
  const foreignOpp = await user.api.post(ws(user, "/calls"), {
    data: { ...newCall, opportunity: { id: "00000000-0000-0000-0000-000000000000" } },
  });
  expect(foreignOpp.status()).toBe(404);
});
