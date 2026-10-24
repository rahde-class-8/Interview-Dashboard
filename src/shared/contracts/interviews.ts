import { z } from "zod";

import { dateTimeSchema, labelList, nonEmptyPatch, optionalText, pageQuerySchema, requiredText, uuidSchema } from "./common";

export const interviewStageSchema = z.enum(["recruiter_screen", "technical", "hiring_manager", "offer"]);
export const interviewStatusSchema = z.enum(["scheduled", "completed", "cancelled", "rescheduled"]);
export const interviewOutcomeSchema = z.enum(["pending", "advanced", "rejected", "offer"]);
export const interviewFormatSchema = z.enum(["video", "phone", "onsite"]);

const fields = {
  title: requiredText(200, "Title"),
  stage: interviewStageSchema,
  scheduledAt: dateTimeSchema,
  durationMinutes: z.number().int().min(1).max(1440),
  format: interviewFormatSchema,
  interviewers: labelList(20, 120),
  status: interviewStatusSchema,
  outcome: interviewOutcomeSchema,
  notes: optionalText(10_000),
};

export const interviewCreateSchema = z.object({
  opportunityId: uuidSchema,
  ...fields,
  interviewers: fields.interviewers.optional(),
  status: fields.status.optional(),
  outcome: fields.outcome.optional(),
  notes: fields.notes.optional(),
});

export const interviewUpdateSchema = nonEmptyPatch(z.object(fields).partial());

export const interviewListQuerySchema = pageQuerySchema.extend({
  opportunityId: uuidSchema.optional(),
  status: interviewStatusSchema.optional(),
  upcoming: z.enum(["true", "false"]).optional(),
  from: dateTimeSchema.optional(),
  to: dateTimeSchema.optional(),
  order: z.enum(["asc", "desc"]).default("asc"),
});

export interface Interview {
  id: string;
  workspaceId: string;
  opportunityId: string;
  opportunity: { id: string; title: string; companyName: string };
  title: string;
  stage: z.infer<typeof interviewStageSchema>;
  scheduledAt: string;
  durationMinutes: number;
  format: z.infer<typeof interviewFormatSchema>;
  interviewers: string[];
  status: z.infer<typeof interviewStatusSchema>;
  outcome: z.infer<typeof interviewOutcomeSchema>;
  notes: string;
  createdAt: string;
  updatedAt: string;
}
