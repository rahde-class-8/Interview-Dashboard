import { z } from "zod";

import { nonEmptyPatch, nullableText, pageQuerySchema, requiredText, uuidSchema } from "./common";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Must be a valid email address."))
  .nullable()
  .or(z.literal("").transform(() => null));

export const recruiterCreateSchema = z.object({
  name: requiredText(120, "Name"),
  email: email.optional(),
  phone: nullableText(40).optional(),
  agency: nullableText(120).optional(),
  companyId: uuidSchema.nullable().optional(),
});

export const recruiterUpdateSchema = nonEmptyPatch(recruiterCreateSchema.partial());

/** How a call or opportunity refers to its recruiter. */
export const recruiterRefSchema = z.union([
  z.object({ create: recruiterCreateSchema.omit({ companyId: true }) }).strict(),
  z.object({ id: uuidSchema, update: recruiterUpdateSchema.optional() }).strict(),
]);

export const recruiterListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  companyId: uuidSchema.optional(),
});

export interface Recruiter {
  id: string;
  workspaceId: string;
  companyId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  agency: string | null;
  createdAt: string;
  updatedAt: string;
}
