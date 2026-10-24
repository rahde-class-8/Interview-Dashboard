import { z } from "zod";

import { labelList, nonEmptyPatch, optionalText, pageQuerySchema, requiredText, uuidSchema } from "./common";
import { recruiterRefSchema } from "./recruiters";

export const OPPORTUNITY_STAGES = ["new", "recruiter_screen", "technical", "hiring_manager", "offer", "closed"] as const;
export const stageSchema = z.enum(OPPORTUNITY_STAGES);
export type OpportunityStage = z.infer<typeof stageSchema>;

export const workModeSchema = z.enum(["remote", "hybrid", "onsite"]);
export const employmentTypeSchema = z.enum(["full_time", "contract", "contract_to_hire", "part_time"]);

export const compensationSchema = z
  .object({
    min: z.number().nonnegative().max(9_999_999_999),
    max: z.number().nonnegative().max(9_999_999_999),
    currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code.").default("USD"),
    period: z.enum(["year", "hour"]),
  })
  .refine((c) => c.max >= c.min, { path: ["max"], message: "Maximum must be at least the minimum." });

/** Existing company by id, or find-or-create by name. */
export const companyRefSchema = z.union([
  z.object({ id: uuidSchema }).strict(),
  z.object({ name: requiredText(200, "Company name") }).strict(),
]);

const opportunityFields = {
  title: requiredText(200, "Title"),
  location: optionalText(200),
  workMode: workModeSchema,
  employmentType: employmentTypeSchema,
  compensation: compensationSchema.nullable(),
  stage: stageSchema,
  jobDescription: optionalText(20_000),
  requiredSkills: labelList(),
  preferredSkills: labelList(),
  prepNotes: optionalText(20_000),
  company: companyRefSchema,
};

export const opportunityCreateSchema = z.object({
  ...opportunityFields,
  location: opportunityFields.location.optional(),
  compensation: opportunityFields.compensation.optional(),
  stage: opportunityFields.stage.optional(),
  jobDescription: opportunityFields.jobDescription.optional(),
  requiredSkills: opportunityFields.requiredSkills.optional(),
  preferredSkills: opportunityFields.preferredSkills.optional(),
  prepNotes: opportunityFields.prepNotes.optional(),
  recruiter: recruiterRefSchema.nullable().optional(),
});

export const opportunityUpdateSchema = nonEmptyPatch(
  z.object(opportunityFields).partial().extend({ recruiter: recruiterRefSchema.nullable().optional() }),
);

export const stageChangeSchema = z.object({ stage: stageSchema });

export const opportunityListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  stage: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(",").map((s) => s.trim()) : undefined))
    .pipe(z.array(stageSchema).optional()),
  companyId: uuidSchema.optional(),
  recruiterId: uuidSchema.optional(),
  sort: z.enum(["updated", "created", "title"]).default("updated"),
});

export interface Opportunity {
  id: string;
  workspaceId: string;
  title: string;
  location: string;
  workMode: z.infer<typeof workModeSchema>;
  employmentType: z.infer<typeof employmentTypeSchema>;
  compensation: { min: number; max: number; currency: string; period: "year" | "hour" } | null;
  stage: OpportunityStage;
  stageChangedAt: string;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  prepNotes: string;
  company: { id: string; name: string };
  recruiter: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}
