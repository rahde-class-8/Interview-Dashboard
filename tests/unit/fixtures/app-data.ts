import type { AppData, Opportunity, RecruiterCall } from "@/types";

/** Small fictional dataset for business-rule tests. "Now" is 2026-10-25T12:00:00Z. */
export const NOW = new Date("2026-10-25T12:00:00Z");

const opp = (id: string, stage: Opportunity["stage"], extra: Partial<Opportunity> = {}): Opportunity => ({
  id,
  companyId: "co1",
  recruiterId: "r1",
  title: `Role ${id}`,
  location: "",
  workMode: "remote",
  employmentType: "full_time",
  stage,
  jobDescription: "",
  requiredSkills: [],
  preferredSkills: [],
  prepNotes: "",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...extra,
});

const call = (id: string, opportunityId: string, at: string, extra: Partial<RecruiterCall> = {}): RecruiterCall => ({
  id,
  opportunityId,
  recruiterId: "r1",
  callDateTime: at,
  durationMinutes: 30,
  hiringManagerPriorities: [],
  interviewStages: [],
  recruiterAdvice: "",
  technicalTopics: [],
  behavioralThemes: [],
  candidateQuestions: [],
  redFlags: [],
  interestLevel: 7,
  notes: "",
  createdAt: at,
  updatedAt: at,
  ...extra,
});

export function sampleData(): AppData {
  return {
    currentUser: { id: "u1", name: "Fictional User", email: "user@example.com", title: "" },
    workspace: { id: "w1", name: "W", ownerId: "u1", role: "owner", recordingRetentionDays: null, createdAt: "2026-10-01T00:00:00Z" },
    collaborators: [],
    companies: [{ id: "co1", name: "Fictional Co", industry: "", headquarters: "" }],
    recruiters: [{ id: "r1", name: "Casey", email: "", phone: "", companyId: "co1" }],
    opportunities: [
      opp("o1", "technical", { requiredSkills: ["AWS", "Terraform"] }),
      opp("o2", "closed"),
      opp("o3", "new", { recruiterId: undefined, requiredSkills: ["aws"] }),
    ],
    calls: [
      call("c1", "o1", "2026-10-20T15:00:00Z", { technicalTopics: ["AWS", "Kubernetes"], recruiterAdvice: "Be concrete", redFlags: ["On-call"] }),
      call("c2", "o1", "2026-10-22T15:00:00Z", { technicalTopics: ["aws "], redFlags: ["On-call", "Reorg"], recruiterId: undefined }),
    ],
    recordings: [
      { id: "rec1", callId: "c1", fileName: "a.mp3", fileSizeBytes: 1, mimeType: "audio/mpeg", status: "uploaded", addedAt: "2026-10-20T16:00:00Z" },
      { id: "rec2", callId: "c1", fileName: "b.mp3", fileSizeBytes: 1, mimeType: "audio/mpeg", status: "failed", addedAt: "2026-10-20T16:00:00Z" },
    ],
    interviews: [
      { id: "i1", opportunityId: "o1", title: "Tech", stage: "technical", scheduledAt: "2026-10-28T15:00:00Z", durationMinutes: 60, format: "video", interviewers: [], status: "scheduled", outcome: "pending", notes: "" },
      { id: "i2", opportunityId: "o1", title: "Past", stage: "technical", scheduledAt: "2026-10-10T15:00:00Z", durationMinutes: 60, format: "video", interviewers: [], status: "scheduled", outcome: "pending", notes: "" },
      { id: "i3", opportunityId: "o1", title: "Cancelled", stage: "technical", scheduledAt: "2026-10-29T15:00:00Z", durationMinutes: 60, format: "video", interviewers: [], status: "cancelled", outcome: "pending", notes: "" },
    ],
    followUps: [
      { id: "f1", opportunityId: "o1", callId: "c1", title: "Thank-you", dueDate: "2026-10-24T12:00:00Z", completed: false },
      { id: "f2", opportunityId: "o1", callId: "c2", title: "Portfolio", dueDate: "2026-10-30T12:00:00Z", completed: false },
      { id: "f3", opportunityId: "o1", callId: "c2", title: "Done one", dueDate: "2026-10-01T12:00:00Z", completed: true },
    ],
    preparationTasks: [],
    starStories: [],
    questions: [],
    sharedNotes: [],
    comments: [],
    activity: [],
  };
}
