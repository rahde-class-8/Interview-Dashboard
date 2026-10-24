import { z } from "zod";

import { dateSchema, labelList, nonEmptyPatch, optionalText, pageQuerySchema, requiredText, uuidSchema } from "./common";

// Preparation tasks -------------------------------------------------------------

export const prepCategorySchema = z.enum(["technical", "behavioral", "research", "logistics"]);

export const preparationTaskCreateSchema = z.object({
  opportunityId: uuidSchema,
  title: requiredText(300, "Title"),
  category: prepCategorySchema,
  dueDate: dateSchema.nullable().optional(),
});

export const preparationTaskUpdateSchema = nonEmptyPatch(
  z.object({
    title: requiredText(300, "Title").optional(),
    category: prepCategorySchema.optional(),
    dueDate: dateSchema.nullable().optional(),
    completed: z.boolean().optional(),
  }),
);

export const taskStatusSchema = z.enum(["pending", "completed", "all"]);

export const preparationTaskListQuerySchema = pageQuerySchema.extend({
  opportunityId: uuidSchema.optional(),
  status: taskStatusSchema.default("all"),
  category: prepCategorySchema.optional(),
});

export interface PreparationTask {
  id: string;
  workspaceId: string;
  opportunityId: string;
  title: string;
  category: z.infer<typeof prepCategorySchema>;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Questions -----------------------------------------------------------------------

export const questionTypeSchema = z.enum(["technical", "behavioral"]);
export const difficultySchema = z.enum(["easy", "medium", "hard"]);

export const questionCreateSchema = z.object({
  type: questionTypeSchema,
  topic: requiredText(80, "Topic"),
  difficulty: difficultySchema,
  question: requiredText(2000, "Question"),
  answerNotes: optionalText(20_000).optional(),
  companyId: uuidSchema.nullable().optional(),
});

export const questionUpdateSchema = nonEmptyPatch(questionCreateSchema.partial());

export const questionListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  type: questionTypeSchema.optional(),
  topic: z.string().trim().max(80).optional(),
  difficulty: difficultySchema.optional(),
  /** A company id, or "general" for questions not tied to a company. */
  companyId: z.union([uuidSchema, z.literal("general")]).optional(),
});

export interface Question {
  id: string;
  workspaceId: string;
  type: z.infer<typeof questionTypeSchema>;
  topic: string;
  difficulty: z.infer<typeof difficultySchema>;
  question: string;
  answerNotes: string;
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
}

// STAR stories --------------------------------------------------------------------

export const starStoryCreateSchema = z.object({
  title: requiredText(200, "Title"),
  situation: optionalText(5000).optional(),
  task: optionalText(5000).optional(),
  action: optionalText(5000).optional(),
  result: optionalText(5000).optional(),
  themes: labelList(20, 100).optional(),
});

export const starStoryUpdateSchema = nonEmptyPatch(starStoryCreateSchema.partial());

export const starStoryListQuerySchema = pageQuerySchema.extend({ q: z.string().trim().max(200).optional() });

export interface StarStory {
  id: string;
  workspaceId: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  themes: string[];
  createdAt: string;
  updatedAt: string;
}
