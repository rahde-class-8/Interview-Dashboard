import { z } from "zod";

import { dateSchema, nonEmptyPatch, pageQuerySchema, requiredText, uuidSchema } from "./common";
import { taskStatusSchema } from "./preparation";

export const followUpCreateSchema = z.object({
  opportunityId: uuidSchema,
  title: requiredText(300, "Title"),
  dueDate: dateSchema,
});

export const followUpUpdateSchema = nonEmptyPatch(
  z.object({
    title: requiredText(300, "Title").optional(),
    dueDate: dateSchema.optional(),
    completed: z.boolean().optional(),
  }),
);

export const followUpListQuerySchema = pageQuerySchema.extend({
  opportunityId: uuidSchema.optional(),
  status: taskStatusSchema.default("all"),
  /** upcoming: pending with dueDate >= asOf; overdue: pending with dueDate < asOf. */
  due: z.enum(["all", "upcoming", "overdue"]).default("all"),
  /** The caller's local date (defaults to today in UTC). */
  asOf: dateSchema.optional(),
});

export interface FollowUp {
  id: string;
  workspaceId: string;
  opportunityId: string;
  callId: string | null;
  title: string;
  dueDate: string;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
