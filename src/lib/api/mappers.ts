import { fromDateInputValue, toDateInputValue } from "@/lib/format";
import type { Call } from "@/shared/contracts/calls";
import type {
  ActivityEvent as ApiActivity,
  Comment as ApiComment,
  Invitation,
  Member,
  SharedNote as ApiNote,
  SharedNoteSummary,
} from "@/shared/contracts/collaboration";
import type { Company as ApiCompany } from "@/shared/contracts/companies";
import type { FollowUp } from "@/shared/contracts/follow-ups";
import type { Interview as ApiInterview } from "@/shared/contracts/interviews";
import type { Opportunity as ApiOpportunity } from "@/shared/contracts/opportunities";
import type { PreparationTask as ApiPrepTask, Question, StarStory as ApiStarStory } from "@/shared/contracts/preparation";
import type { Recording } from "@/shared/contracts/recordings";
import type { Recruiter as ApiRecruiter } from "@/shared/contracts/recruiters";
import type { Workspace as ApiWorkspace } from "@/shared/contracts/workspaces";
import type {
  ActivityEvent,
  Collaborator,
  Comment,
  Company,
  FollowUpTask,
  Interview,
  InterviewQuestion,
  Opportunity,
  PreparationTask,
  RecordingAttachment,
  Recruiter,
  RecruiterCall,
  SharedNote,
  StarStory,
  Workspace,
} from "@/types";

/**
 * Converts API records into the UI's domain models. Calendar dates (YYYY-MM-DD)
 * become local-noon ISO timestamps, which is how the UI has always stored them.
 */

export const fromDateOnly = (date: string) => fromDateInputValue(date);
export const toDateOnly = (iso: string) => toDateInputValue(iso);

export function toWorkspace(w: ApiWorkspace): Workspace {
  return {
    id: w.id,
    name: w.name,
    ownerId: w.ownerId,
    role: w.role,
    recordingRetentionDays: w.recordingRetentionDays,
    createdAt: w.createdAt,
  };
}

export function toCompany(c: ApiCompany): Company {
  return { id: c.id, name: c.name, industry: c.industry ?? "", headquarters: c.headquarters ?? "", website: c.website ?? undefined };
}

export function toRecruiter(r: ApiRecruiter): Recruiter {
  return {
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    phone: r.phone ?? "",
    agency: r.agency ?? undefined,
    companyId: r.companyId ?? undefined,
  };
}

export function toOpportunity(o: ApiOpportunity): Opportunity {
  return {
    id: o.id,
    companyId: o.company.id,
    recruiterId: o.recruiter?.id,
    title: o.title,
    location: o.location,
    workMode: o.workMode,
    employmentType: o.employmentType,
    compensation: o.compensation ?? undefined,
    stage: o.stage,
    jobDescription: o.jobDescription,
    requiredSkills: o.requiredSkills,
    preferredSkills: o.preferredSkills,
    prepNotes: o.prepNotes,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

export function toCall(c: Call): RecruiterCall {
  return {
    id: c.id,
    opportunityId: c.opportunity.id,
    recruiterId: c.recruiter?.id,
    callDateTime: c.callAt,
    durationMinutes: c.durationMinutes,
    hiringManagerPriorities: c.hiringManagerPriorities,
    interviewStages: c.interviewStages,
    recruiterAdvice: c.recruiterAdvice,
    technicalTopics: c.technicalTopics,
    behavioralThemes: c.behavioralThemes,
    // Stable ids per position keep React keys steady across refetches.
    candidateQuestions: c.candidateQuestions.map((q, i) => ({ id: `${c.id}-q${i}`, question: q.question, answer: q.answer })),
    redFlags: c.redFlags,
    interestLevel: c.interestLevel,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function toRecording(r: Recording): RecordingAttachment {
  return {
    id: r.id,
    callId: r.callId,
    fileName: r.fileName,
    fileSizeBytes: r.fileSize,
    mimeType: r.mimeType,
    durationSeconds: r.durationSeconds ?? undefined,
    status: r.status === "deleted" ? "failed" : r.status,
    failureReason: r.failureReason ?? undefined,
    uploadedBy: r.uploadedBy ?? undefined,
    deleteAfter: r.deleteAfter ?? undefined,
    addedAt: r.uploadedAt ?? r.createdAt,
  };
}

export function toInterview(i: ApiInterview): Interview {
  return {
    id: i.id,
    opportunityId: i.opportunityId,
    title: i.title,
    stage: i.stage,
    scheduledAt: i.scheduledAt,
    durationMinutes: i.durationMinutes,
    format: i.format,
    interviewers: i.interviewers,
    status: i.status,
    outcome: i.outcome,
    notes: i.notes,
  };
}

export function toFollowUp(f: FollowUp): FollowUpTask {
  return {
    id: f.id,
    opportunityId: f.opportunityId,
    callId: f.callId ?? undefined,
    title: f.title,
    dueDate: fromDateOnly(f.dueDate),
    completed: f.completed,
    completedAt: f.completedAt ?? undefined,
  };
}

export function toPrepTask(t: ApiPrepTask): PreparationTask {
  return {
    id: t.id,
    opportunityId: t.opportunityId,
    title: t.title,
    category: t.category,
    dueDate: t.dueDate ? fromDateOnly(t.dueDate) : undefined,
    completed: t.completed,
  };
}

export function toStarStory(s: ApiStarStory): StarStory {
  return { id: s.id, title: s.title, situation: s.situation, task: s.task, action: s.action, result: s.result, themes: s.themes };
}

export function toQuestion(q: Question): InterviewQuestion {
  return {
    id: q.id,
    type: q.type,
    topic: q.topic,
    companyId: q.companyId ?? undefined,
    difficulty: q.difficulty,
    question: q.question,
    answerNotes: q.answerNotes,
  };
}

export function toNote(n: ApiNote | SharedNoteSummary, body?: string): SharedNote {
  return {
    id: n.id,
    workspaceId: n.workspaceId,
    title: n.title,
    body: "body" in n ? n.body : (body ?? ""),
    opportunityId: n.opportunityId ?? undefined,
    version: n.version,
    updatedAt: n.updatedAt,
    updatedBy: n.updatedBy?.displayName ?? "A former member",
  };
}

export function toComment(c: ApiComment): Comment {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    noteId: c.noteId,
    authorId: c.author?.id,
    authorName: c.author?.displayName ?? "A former member",
    body: c.body ?? "",
    deleted: c.deleted,
    editedAt: c.editedAt ?? undefined,
    createdAt: c.createdAt,
  };
}

export function toActivity(a: ApiActivity): ActivityEvent {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    actorName: a.actor?.displayName ?? "Someone",
    summary: a.summary,
    action: a.action,
    createdAt: a.createdAt,
  };
}

export function toCollaborators(workspaceId: string, members: Member[], invitations: Invitation[]): Collaborator[] {
  return [
    ...members.map<Collaborator>((m) => ({
      id: m.userId,
      kind: "member",
      workspaceId,
      name: m.displayName,
      email: m.email,
      role: m.role,
      status: "active",
      isYou: m.isYou,
      invitedAt: m.joinedAt,
    })),
    ...invitations
      .filter((i) => i.status === "pending" || i.status === "expired")
      .map<Collaborator>((i) => ({
        id: i.id,
        kind: "invitation",
        workspaceId,
        name: i.email,
        email: i.email,
        role: i.role,
        status: i.status === "expired" ? "expired" : "pending",
        isYou: false,
        invitedAt: i.createdAt,
        expiresAt: i.expiresAt,
      })),
  ];
}
