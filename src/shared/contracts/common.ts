import { z } from "zod";

/** Building blocks shared by all API contracts (client and server). */

export const uuidSchema = z.uuid({ message: "Must be a valid id." });

/** ISO-8601 timestamp with timezone, e.g. 2026-10-24T15:00:00Z. */
export const dateTimeSchema = z.iso.datetime({ offset: true, message: "Must be an ISO-8601 date-time." });

/** Calendar date, e.g. 2026-10-27. */
export const dateSchema = z.iso.date({ message: "Must be a date in YYYY-MM-DD format." });

export const optionalText = (max: number) => z.string().trim().max(max, `Must be at most ${max} characters.`);

export const requiredText = (max: number, label = "This field") =>
  z.string().trim().min(1, `${label} is required.`).max(max, `Must be at most ${max} characters.`);

/** Nullable optional text: empty strings become null. */
export const nullableText = (max: number) =>
  optionalText(max)
    .nullable()
    .transform((v) => (v === "" ? null : v));

/** List of short labels (skills, topics…): trimmed, non-empty, de-duplicated case-insensitively. */
export const labelList = (maxItems = 50, maxLength = 200) =>
  z
    .array(z.string().trim().min(1).max(maxLength, `Each item must be at most ${maxLength} characters.`))
    .max(maxItems, `At most ${maxItems} items.`)
    .transform((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

export const roleSchema = z.enum(["owner", "editor", "commenter", "viewer"]);
export type Role = z.infer<typeof roleSchema>;

/** Query parameters common to every collection. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

export interface Page<T> {
  data: T[];
  /** Pass as `cursor` to fetch the next page; null when there are no more results. */
  nextCursor: string | null;
}

export type ApiErrorCode =
  | "validation_failed"
  | "invalid_json"
  | "invalid_reference"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "in_use"
  | "payload_too_large"
  | "unsupported_media_type"
  | "quota_exceeded"
  | "rate_limited"
  | "invalid_recording"
  | "upload_incomplete"
  | "storage_unavailable"
  | "internal_error";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: { path: string; message: string }[];
    requestId: string;
  };
}

/** Requires at least one key in a PATCH body. */
export function nonEmptyPatch<T extends z.ZodObject>(schema: T) {
  return schema.refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: "Provide at least one field to update.",
  });
}
