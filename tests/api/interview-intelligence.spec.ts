import { expect, test } from "@playwright/test";

import { createUser, deleteUsers, ws, type TestUser } from "./helpers";

let user: TestUser;
let opportunityId: string;
let companyId: string;

test.beforeAll(async () => {
  user = await createUser("intel");
  const opp = await (
    await user.api.post(ws(user, "/opportunities"), {
      data: { company: { name: "Vertex Health Labs" }, title: "Site Reliability Engineer", workMode: "onsite", employmentType: "full_time" },
    })
  ).json();
  opportunityId = opp.id;
  companyId = opp.company.id;
});
test.afterAll(async () => deleteUsers([user]));

test("interviews: schedule, update status and outcome, filter upcoming", async () => {
  const api = user.api;
  const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const upcoming = await (
    await api.post(ws(user, "/interviews"), {
      data: { opportunityId, title: "Technical round", stage: "technical", scheduledAt: future, durationMinutes: 60, format: "video", interviewers: ["Chris"] },
    })
  ).json();
  expect(upcoming).toMatchObject({ status: "scheduled", outcome: "pending", opportunity: { title: "Site Reliability Engineer", companyName: "Vertex Health Labs" } });
  await api.post(ws(user, "/interviews"), {
    data: { opportunityId, title: "Screen", stage: "recruiter_screen", scheduledAt: past, durationMinutes: 30, format: "phone" },
  });

  const list = await (await api.get(ws(user, "/interviews?upcoming=true"))).json();
  expect(list.data.map((i: { id: string }) => i.id)).toEqual([upcoming.id]);

  const done = await (await api.patch(ws(user, `/interviews/${upcoming.id}`), { data: { status: "completed", outcome: "advanced" } })).json();
  expect(done).toMatchObject({ status: "completed", outcome: "advanced", title: "Technical round" });
  expect((await (await api.get(ws(user, "/interviews?upcoming=true"))).json()).data).toEqual([]);
  expect((await api.post(ws(user, "/interviews"), { data: { opportunityId, title: "x", stage: "closed", scheduledAt: future, durationMinutes: 60, format: "video" } })).status()).toBe(400);
});

test("preparation tasks: create, complete, filter", async () => {
  const api = user.api;
  const task = await (
    await api.post(ws(user, "/preparation-tasks"), { data: { opportunityId, title: "Review SLOs", category: "technical", dueDate: "2026-10-25" } })
  ).json();
  expect(task).toMatchObject({ completed: false, completedAt: null, dueDate: "2026-10-25" });
  await api.post(ws(user, "/preparation-tasks"), { data: { opportunityId, title: "Research Vertex", category: "research" } });

  const completed = await (await api.patch(ws(user, `/preparation-tasks/${task.id}`), { data: { completed: true } })).json();
  expect(completed.completed).toBe(true);
  expect(completed.completedAt).not.toBeNull();

  const pending = await (await api.get(ws(user, `/preparation-tasks?status=pending&opportunityId=${opportunityId}`))).json();
  expect(pending.data.map((t: { title: string }) => t.title)).toEqual(["Research Vertex"]);
  const all = await (await api.get(ws(user, "/preparation-tasks"))).json();
  expect(all.data.map((t: { title: string }) => t.title)).toEqual(["Review SLOs", "Research Vertex"]); // dated first, undated last

  const reopened = await (await api.patch(ws(user, `/preparation-tasks/${task.id}`), { data: { completed: false } })).json();
  expect(reopened.completedAt).toBeNull();
});

test("questions: company-specific vs general, literal search", async () => {
  const api = user.api;
  await api.post(ws(user, "/questions"), { data: { type: "technical", topic: "Linux", difficulty: "medium", question: "What does 100% CPU steal mean?" } });
  await api.post(ws(user, "/questions"), {
    data: { type: "behavioral", topic: "Ownership", difficulty: "easy", question: "Tell me about an incident.", companyId },
  });

  const general = await (await api.get(ws(user, "/questions?companyId=general"))).json();
  expect(general.data.map((q: { topic: string }) => q.topic)).toEqual(["Linux"]);
  const specific = await (await api.get(ws(user, `/questions?companyId=${companyId}`))).json();
  expect(specific.data.map((q: { topic: string }) => q.topic)).toEqual(["Ownership"]);
  const percent = await (await api.get(ws(user, `/questions?q=${encodeURIComponent("100%")}`))).json();
  expect(percent.data).toHaveLength(1);
  const literal = await (await api.get(ws(user, `/questions?q=${encodeURIComponent("%")}`))).json();
  expect(literal.data).toHaveLength(1); // % matches literally, not as a wildcard for everything
  const behavioral = await (await api.get(ws(user, "/questions?type=behavioral"))).json();
  expect(behavioral.data).toHaveLength(1);
});

test("STAR stories: create and update", async () => {
  const story = await (
    await user.api.post(ws(user, "/star-stories"), { data: { title: "Cut AWS spend 28%", themes: ["Ownership", "ownership", "Cost"] } })
  ).json();
  expect(story).toMatchObject({ themes: ["Ownership", "Cost"], situation: "" });
  const updated = await (await user.api.patch(ws(user, `/star-stories/${story.id}`), { data: { result: "Saved $41k/month" } })).json();
  expect(updated).toMatchObject({ result: "Saved $41k/month", title: "Cut AWS spend 28%" });
});

test("follow-ups: upcoming and overdue relative to the caller's date", async () => {
  const api = user.api;
  const overdue = await (await api.post(ws(user, "/follow-ups"), { data: { opportunityId, title: "Ask for feedback", dueDate: "2026-10-20" } })).json();
  const upcoming = await (await api.post(ws(user, "/follow-ups"), { data: { opportunityId, title: "Send salary range", dueDate: "2026-10-27" } })).json();

  const overdueList = await (await api.get(ws(user, "/follow-ups?due=overdue&asOf=2026-10-24"))).json();
  expect(overdueList.data.map((f: { id: string }) => f.id)).toEqual([overdue.id]);
  const upcomingList = await (await api.get(ws(user, "/follow-ups?due=upcoming&asOf=2026-10-24"))).json();
  expect(upcomingList.data.map((f: { id: string }) => f.id)).toEqual([upcoming.id]);

  await api.patch(ws(user, `/follow-ups/${overdue.id}`), { data: { completed: true } });
  expect((await (await api.get(ws(user, "/follow-ups?due=overdue&asOf=2026-10-24"))).json()).data).toEqual([]);
  const completed = await (await api.get(ws(user, "/follow-ups?status=completed"))).json();
  expect(completed.data.map((f: { id: string }) => f.id)).toEqual([overdue.id]);
  expect((await api.get(ws(user, "/follow-ups?asOf=24-10-2026"))).status()).toBe(400);
});
