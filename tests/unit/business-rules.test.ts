import { describe, expect, it } from "vitest";

import { appReducer } from "@/lib/store/reducer";
import {
  getCallFollowUp,
  getCallRows,
  getDashboardMetrics,
  getOpportunityIntel,
  getSkillFrequency,
  getUpcomingInterviews,
  isOverdue,
} from "@/lib/store/selectors";
import { NOW, sampleData } from "./fixtures/app-data";

describe("dashboard metrics (computed from records, never hardcoded)", () => {
  it("counts calls, active opportunities, upcoming interviews and pending/overdue follow-ups", () => {
    expect(getDashboardMetrics(sampleData(), NOW)).toEqual({
      totalCalls: 2,
      activeOpportunities: 2, // closed excluded
      upcomingInterviews: 1, // past and cancelled excluded
      pendingFollowUps: 2,
      overdueFollowUps: 1,
    });
  });

  it("orders upcoming interviews by date", () => {
    expect(getUpcomingInterviews(sampleData(), NOW).map((i) => i.id)).toEqual(["i1"]);
  });
});

describe("follow-up rules", () => {
  it("is overdue only when pending and past due", () => {
    expect(isOverdue({ dueDate: "2026-10-24T12:00:00Z", completed: false }, NOW)).toBe(true);
    expect(isOverdue({ dueDate: "2026-10-24T12:00:00Z", completed: true }, NOW)).toBe(false);
    expect(isOverdue({ dueDate: "2026-10-26T12:00:00Z", completed: false }, NOW)).toBe(false);
  });

  it("shows a call's next pending follow-up, falling back to a completed one", () => {
    const data = sampleData();
    expect(getCallFollowUp(data, "c2")?.id).toBe("f2");
    data.followUps = data.followUps.filter((f) => f.id !== "f2");
    expect(getCallFollowUp(data, "c2")?.id).toBe("f3");
  });
});

describe("recruiter intelligence", () => {
  it("merges topics and flags across calls without duplicates, newest call first", () => {
    const intel = getOpportunityIntel(sampleData(), "o1");
    expect(intel.calls.map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(intel.redFlags).toEqual(["On-call", "Reorg"]);
    expect(intel.advice).toEqual([{ callId: "c1", date: "2026-10-20T15:00:00Z", text: "Be concrete" }]);
  });

  it("counts skills case-insensitively across calls and opportunities", () => {
    expect(getSkillFrequency(sampleData())[0]).toEqual({ label: "AWS", count: 4 });
  });
});

describe("call rows", () => {
  it("joins related records and counts only verified recordings", () => {
    const rows = getCallRows(sampleData());
    expect(rows.map((r) => r.call.id)).toEqual(["c2", "c1"]);
    expect(rows[0]).toMatchObject({ recruiterName: "No recruiter", companyName: "Fictional Co", recordingCount: 0 });
    expect(rows[1]).toMatchObject({ recruiterName: "Casey", recordingCount: 1 });
  });
});

describe("store reducer", () => {
  it("deleting an opportunity removes its calls, recordings, interviews and follow-ups", () => {
    const next = appReducer(sampleData(), { type: "opportunity/delete", id: "o1" });
    expect(next.opportunities.map((o) => o.id)).toEqual(["o2", "o3"]);
    expect(next.calls).toEqual([]);
    expect(next.recordings).toEqual([]);
    expect(next.interviews).toEqual([]);
    expect(next.followUps).toEqual([]);
  });

  it("deleting a recruiter unlinks it instead of deleting calls", () => {
    const next = appReducer(sampleData(), { type: "recruiter/delete", id: "r1" });
    expect(next.calls.every((c) => c.recruiterId === undefined)).toBe(true);
    expect(next.calls).toHaveLength(2);
  });

  it("appends new comments to the end of the thread and updates existing ones in place", () => {
    const base = { workspaceId: "w1", noteId: "n1", authorName: "A", deleted: false, createdAt: "2026-10-25T00:00:00Z" };
    let state = appReducer(sampleData(), { type: "comment/upsert", comment: { ...base, id: "a", body: "first" } });
    state = appReducer(state, { type: "comment/upsert", comment: { ...base, id: "b", body: "second" } });
    state = appReducer(state, { type: "comment/upsert", comment: { ...base, id: "a", body: "", deleted: true } });
    expect(state.comments.map((c) => [c.id, c.deleted])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });
});
