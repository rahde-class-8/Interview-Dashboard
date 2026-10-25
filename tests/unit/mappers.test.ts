import { describe, expect, it } from "vitest";

import { toCall, toCollaborators, toComment, toFollowUp, toNote, toOpportunity, toRecording } from "@/lib/api/mappers";
import { toDateInputValue } from "@/lib/format";

const at = "2026-10-25T12:00:00.000Z";

describe("API → UI mappers", () => {
  it("keeps calendar dates on the same local day", () => {
    const task = toFollowUp({
      id: "f1",
      workspaceId: "w",
      opportunityId: "o",
      callId: null,
      title: "Send note",
      dueDate: "2026-11-02",
      completed: false,
      completedAt: null,
      createdAt: at,
      updatedAt: at,
    });
    expect(toDateInputValue(task.dueDate)).toBe("2026-11-02");
    expect(task.callId).toBeUndefined();
  });

  it("maps opportunities with optional recruiter and compensation", () => {
    const o = toOpportunity({
      id: "o1",
      workspaceId: "w",
      title: "SRE",
      location: "",
      workMode: "remote",
      employmentType: "full_time",
      compensation: null,
      stage: "technical",
      stageChangedAt: at,
      jobDescription: "",
      requiredSkills: [],
      preferredSkills: [],
      prepNotes: "",
      company: { id: "c1", name: "Fictional Co" },
      recruiter: null,
      createdAt: at,
      updatedAt: at,
    });
    expect(o).toMatchObject({ companyId: "c1", recruiterId: undefined, compensation: undefined });
  });

  it("gives candidate questions stable ids and calls an optional recruiter", () => {
    const call = toCall({
      id: "call1",
      workspaceId: "w",
      callAt: at,
      durationMinutes: 30,
      interestLevel: 7,
      technicalTopics: [],
      opportunity: { id: "o1", title: "SRE", stage: "new", company: { id: "c1", name: "Fictional Co" } },
      recruiter: null,
      followUp: null,
      recordingCount: 0,
      createdAt: at,
      updatedAt: at,
      hiringManagerPriorities: [],
      interviewStages: [],
      recruiterAdvice: "",
      behavioralThemes: [],
      redFlags: [],
      candidateQuestions: [{ question: "Team size?", answer: "8" }],
      notes: "",
    });
    expect(call.recruiterId).toBeUndefined();
    expect(call.candidateQuestions).toEqual([{ id: "call1-q0", question: "Team size?", answer: "8" }]);
  });

  it("maps recordings and comments for display", () => {
    const r = toRecording({
      id: "r1",
      workspaceId: "w",
      callId: "call1",
      uploadedBy: null,
      fileName: "a.mp3",
      mimeType: "audio/mpeg",
      fileSize: 10,
      durationSeconds: null,
      status: "uploaded",
      failureReason: null,
      consentConfirmedAt: at,
      uploadedAt: at,
      deleteAfter: null,
      createdAt: at,
      updatedAt: at,
    });
    expect(r).toMatchObject({ status: "uploaded", fileSizeBytes: 10, durationSeconds: undefined, uploadedBy: undefined });

    const c = toComment({ id: "c", workspaceId: "w", noteId: "n", author: null, body: null, deleted: true, editedAt: null, createdAt: at });
    expect(c).toMatchObject({ authorName: "A former member", body: "", deleted: true });
  });

  it("names the last editor of a note, or a former member", () => {
    const base = { id: "n", workspaceId: "w", opportunityId: null, title: "T", body: "B", version: 3, createdBy: null, createdAt: at, updatedAt: at };
    expect(toNote({ ...base, updatedBy: { id: "u", displayName: "Sam" } })).toMatchObject({ updatedBy: "Sam", version: 3, opportunityId: undefined });
    expect(toNote({ ...base, updatedBy: null }).updatedBy).toBe("A former member");
  });

  it("combines members with pending and expired invitations, dropping used ones", () => {
    const list = toCollaborators(
      "w",
      [{ userId: "u1", displayName: "Owner", email: "o@example.com", role: "owner", joinedAt: at, isYou: true }],
      [
        { id: "i1", workspaceId: "w", email: "p@example.com", role: "viewer", status: "pending", invitedBy: "u1", expiresAt: at, acceptedAt: null, createdAt: at },
        { id: "i2", workspaceId: "w", email: "x@example.com", role: "viewer", status: "accepted", invitedBy: "u1", expiresAt: at, acceptedAt: at, createdAt: at },
        { id: "i3", workspaceId: "w", email: "e@example.com", role: "editor", status: "expired", invitedBy: "u1", expiresAt: at, acceptedAt: null, createdAt: at },
      ],
    );
    expect(list.map((c) => [c.kind, c.id, c.status])).toEqual([
      ["member", "u1", "active"],
      ["invitation", "i1", "pending"],
      ["invitation", "i3", "expired"],
    ]);
  });
});
