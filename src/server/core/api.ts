import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import type { ApiErrorBody, Role } from "@/shared/contracts/common";
import { ApiError, forbidden, fromDatabaseError, notFound } from "./errors";
import { createSupabaseServerClient, type ServerSupabaseClient } from "./supabase/server";

const MAX_BODY_BYTES = 1_000_000;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ROLE_RANK: Record<Role, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

export interface ApiContext<P> {
  supabase: ServerSupabaseClient;
  userId: string;
  requestId: string;
  params: P;
}

type Handler<P> = (request: NextRequest, ctx: ApiContext<P>) => Promise<Response>;

/**
 * Wraps a Route Handler with the shared API pipeline: request id, CSRF checks
 * for mutations, body size limit, authentication, error mapping and logging.
 */
export function withApi<P extends Record<string, string> = Record<string, never>>(handler: Handler<P>) {
  return async (request: NextRequest, segment: { params: Promise<P> }): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      if (MUTATING.has(request.method)) assertSafeMutation(request);

      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new ApiError(401, "unauthenticated", "Sign in to continue.");

      const response = await handler(request, { supabase, userId: user.id, requestId, params: await segment.params });
      return withHeaders(response, requestId);
    } catch (error) {
      return withHeaders(errorResponse(error, request, requestId), requestId);
    }
  };
}

function assertSafeMutation(request: NextRequest) {
  // Reject cross-site requests (defense in depth on top of SameSite=Lax cookies).
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin && originHost(origin) !== request.headers.get("host")) {
    throw forbidden("Cross-origin requests are not allowed.");
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", "Request body is too large.");
  const hasBody = length > 0 || request.method === "POST" || request.method === "PUT" || request.method === "PATCH";
  if (hasBody && !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "unsupported_media_type", "Send the request body as application/json.");
  }
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null; // e.g. "null" from sandboxed contexts
  }
}

function errorResponse(error: unknown, request: NextRequest, requestId: string): Response {
  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof z.ZodError) {
    apiError = new ApiError(
      400,
      "validation_failed",
      "The request contains invalid values.",
      error.issues.map((issue) => ({ path: issue.path.join(".") || "(root)", message: issue.message })),
    );
  } else {
    apiError = new ApiError(500, "internal_error", "Something went wrong. Please try again.");
  }

  if (apiError.status >= 500) {
    // Never log request bodies, cookies or tokens.
    console.error(
      JSON.stringify({
        level: "error",
        requestId,
        method: request.method,
        path: request.nextUrl.pathname,
        status: apiError.status,
        error: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : describeUnknown(error),
      }),
    );
  }

  const body: ApiErrorBody = {
    error: { code: apiError.code, message: apiError.message, requestId, ...(apiError.details ? { details: apiError.details } : {}) },
  };
  return NextResponse.json(body, { status: apiError.status });
}

function describeUnknown(error: unknown) {
  if (error && typeof error === "object" && "code" in error) return `code=${String((error as { code: unknown }).code)}`;
  return "unknown error";
}

function withHeaders(response: Response, requestId: string) {
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

// --- Helpers used by route handlers -------------------------------------------------

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export async function readBody<S extends z.ZodType>(request: NextRequest, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  return schema.parse(raw);
}

export function readQuery<S extends z.ZodType>(request: NextRequest, schema: S): z.output<S> {
  return schema.parse(Object.fromEntries(request.nextUrl.searchParams));
}

const uuid = z.uuid();

/** Validates a path id; malformed ids cannot exist, so they are reported as not found. */
export function parseId(value: string, what = "Resource"): string {
  if (!uuid.safeParse(value).success) throw notFound(what);
  return value;
}

/**
 * Confirms the caller is a member of the workspace with at least `minRole`.
 * Non-members get 404 (no existence leak); insufficient roles get 403.
 * RLS still enforces access on every query; this provides precise errors.
 */
export async function requireWorkspace<P>(ctx: ApiContext<P>, workspaceId: string, minRole: Role): Promise<Role> {
  parseId(workspaceId, "Workspace");
  const { data, error } = await ctx.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, "Workspace");
  if (!data) throw notFound("Workspace");
  const role = data.role as Role;
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) throw forbidden();
  return role;
}

type DbError = { code?: string; message?: string };
type DbResult<T> = { data: T | null; error: DbError | null };

/** Returns the data of a successful query that must return data (lists, inserts, single rows). */
export function check<T>(result: DbResult<T>, resource?: string): NonNullable<T> {
  if (result.error) throw fromDatabaseError(result.error, resource);
  if (result.data === null || result.data === undefined) {
    throw new ApiError(500, "internal_error", "Something went wrong. Please try again.");
  }
  return result.data as NonNullable<T>;
}

/** Like check(), but a missing row (maybeSingle) is a legitimate null. */
export function checkMaybe<T>(result: DbResult<T>, resource?: string): NonNullable<T> | null {
  if (result.error) throw fromDatabaseError(result.error, resource);
  return (result.data ?? null) as NonNullable<T> | null;
}

/** For writes without a returned row: only checks for an error. */
export function checkOk(result: { error: DbError | null }, resource?: string): void {
  if (result.error) throw fromDatabaseError(result.error, resource);
}
