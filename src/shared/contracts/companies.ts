import { z } from "zod";

import { nonEmptyPatch, nullableText, pageQuerySchema, requiredText } from "./common";

const website = z
  .string()
  .trim()
  .max(500)
  .regex(/^https?:\/\/\S+$/i, "Must start with http:// or https://")
  .nullable()
  .or(z.literal("").transform(() => null));

export const companyCreateSchema = z.object({
  name: requiredText(200, "Name"),
  industry: nullableText(120).optional(),
  headquarters: nullableText(120).optional(),
  website: website.optional(),
});

export const companyUpdateSchema = nonEmptyPatch(companyCreateSchema.partial());

export const companyListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
});

export interface Company {
  id: string;
  workspaceId: string;
  name: string;
  industry: string | null;
  headquarters: string | null;
  website: string | null;
  createdAt: string;
  updatedAt: string;
}
