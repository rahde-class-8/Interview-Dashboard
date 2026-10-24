import "server-only";

import type { ApiErrorCode } from "@/shared/contracts/common";

export interface ErrorDetail {
  path: string;
  message: string;
}

/** An error that is safe to return to the client as-is. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found.`);
export const forbidden = (message = "You do not have permission to do this.") => new ApiError(403, "forbidden", message);

interface PostgrestErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
}

/**
 * Translates database errors into client-safe API errors. Raw database messages
 * are never exposed, except messages raised by our own functions (P0001/P0002),
 * which are written to be user-facing.
 */
export function fromDatabaseError(error: PostgrestErrorLike, resource = "Resource"): ApiError {
  switch (error.code) {
    case "23505":
      return new ApiError(409, "conflict", `A ${resource.toLowerCase()} with these values already exists.`);
    case "23503":
      // Deleting a referenced row: "update or delete on table … violates foreign key constraint"
      // (the "still referenced" wording is in the error details).
      return error.message?.startsWith("update or delete on table") || error.details?.includes("still referenced")
        ? new ApiError(409, "in_use", `This ${resource.toLowerCase()} is still in use and cannot be deleted.`)
        : new ApiError(400, "invalid_reference", "A referenced record does not exist in this workspace.");
    case "23502":
    case "23514":
    case "22P02":
    case "22003":
    case "22007":
    case "22008":
    case "22023":
      return new ApiError(400, "validation_failed", "The request contains invalid values.");
    case "42501":
      return forbidden();
    case "P0002":
    case "PGRST116":
      return new ApiError(404, "not_found", error.code === "P0002" && error.message ? safeMessage(error.message) : `${resource} not found.`);
    case "P0001":
      return new ApiError(409, "conflict", error.message ? safeMessage(error.message) : "The request conflicts with the current state.");
    default:
      return new ApiError(500, "internal_error", "Something went wrong. Please try again.");
  }
}

function safeMessage(message: string) {
  // Our own RAISE messages are short sentences; guard against anything unexpected.
  return message.length <= 200 ? message.replace(/\.?$/, ".") : "The request could not be completed.";
}
