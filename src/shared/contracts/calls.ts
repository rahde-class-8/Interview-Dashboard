import { z } from "zod";

import { dateSchema, dateTimeSchema, labelList, optionalText, pageQuerySchema, requiredText, uuidSchema } from "./common";
import { opportunityCreateSchema, opportunityUpdateSchema, stageSchema, type OpportunityStage } from "./opportunities";
import { recruiterRefSchema } from "./recruiters";

export const candidateQuestionSchema = z.object({
  question: requiredText(2000, "Question"),
  answer: optionalText(5000).default(""),
});

const callFields = {
  callAt: dateTimeSchema,
  durationMinutes: z.number().int().min(1).max(600),
  interestLevel: z.number().int().min(1).max(10),
  hiringManagerPriorities: labelList(50, 500),
  interviewStages: labelList(30, 300),
  recruiterAdvice: optionalText(10_000),
  technicalTopics: labelList(50, 100),
  behavioralThemes: labelList(50, 200),
  redFlags: labelList(50, 500),
  candidateQuestions: z.array(candidateQuestionSchema).max(30),
  notes: optionalText(100_000),
};

export const followUpRefSchema = z.object({ title: requiredText(300, "Next action"), dueDate: dateSchema }).nullable();

/** Opportunity for a call: existing (optionally edited) or created from the call. */
export const callOpportunityRefSchema = z.union([
  z.object({ create: opportunityCreateSchema.omit({ recruiter: true }) }).strict(),
  z.object({ id: uuidSchema, update: opportunityUpdateSchema.optional() }).strict(),
]);

export const callCreateSchema = z.object({
  opportunity: callOpportunityRefSchema,
  recruiter: recruiterRefSchema.nullable().optional(),
  followUp: followUpRefSchema.optional(),
  ...callFields,
  hiringManagerPriorities: callFields.hiringManagerPriorities.optional(),
  interviewStages: callFields.interviewStages.optional(),
  recruiterAdvice: callFields.recruiterAdvice.optional(),
  technicalTopics: callFields.technicalTopics.optional(),
  behavioralThemes: callFields.behavioralThemes.optional(),
  redFlags: callFields.redFlags.optional(),
  candidateQuestions: callFields.candidateQuestions.optional(),
  notes: callFields.notes.optional(),
});

export const callUpdateSchema = z
  .object(callFields)
  .partial()
  .extend({
    opportunity: callOpportunityRefSchema.optional(),
    recruiter: recruiterRefSchema.nullable().optional(),
    followUp: followUpRefSchema.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Provide at least one field to update.",
  });

export const callListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  stage: stageSchema.optional(),
  opportunityId: uuidSchema.optional(),
  recruiterId: uuidSchema.optional(),
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  /** `detail` returns full `Call` records instead of summaries. */
  view: z.enum(["summary", "detail"]).default("summary"),
});

export interface CallSummary {
  id: string;
  workspaceId: string;
  callAt: string;
  durationMinutes: number;
  interestLevel: number;
  technicalTopics: string[];
  opportunity: { id: string; title: string; stage: OpportunityStage; company: { id: string; name: string } };
  recruiter: { id: string; name: string; email: string | null; phone: string | null; agency: string | null } | null;
  followUp: { id: string; title: string; dueDate: string; completed: boolean } | null;
  recordingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Call extends CallSummary {
  hiringManagerPriorities: string[];
  interviewStages: string[];
  recruiterAdvice: string;
  behavioralThemes: string[];
  redFlags: string[];
  candidateQuestions: { question: string; answer: string }[];
  notes: string;
}
