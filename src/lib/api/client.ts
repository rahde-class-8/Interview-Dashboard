"use client";

import type { ApiErrorBody, ApiErrorCode, Page } from "@/shared/contracts/common";

/** An API error with the server's code, message and field details. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | "network_error",
    message: string,
    readonly details: { path: string; message: string }[] = [],
    /** The full error body (e.g. a note conflict's `current` record). */
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }

  /** Field errors keyed by path, for forms. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

let signingOut = false;
/** Called before signing out, so background requests failing with 401 don't redirect to sign-in themselves. */
export function markSigningOut() {
  signingOut = true;
}

const RETRYABLE = new Set([502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls the app's own API (/api/v1, session cookie auth). Reads are retried on
 * network errors and 502/503/504 with backoff; writes are never retried
 * automatically (the user retries explicitly). A 401 sends the user to sign in.
 */
export async function api<T>(path: string, options: { method?: Method; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = options.method ?? "GET";
  const attempts = method === "GET" ? 3 : 1;
  let lastError: ApiClientError | undefined;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1));
    let response: Response;
    try {
      response = await fetch(`/api/v1${path}`, {
        method,
        signal: options.signal,
        credentials: "same-origin",
        cache: "no-store",
        headers: options.body !== undefined || method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: options.body !== undefined ? JSON.stringify(options.body) : method === "POST" ? "{}" : undefined,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      lastError = new ApiClientError(0, "network_error", "Could not reach the server. Check your connection and try again.");
      continue;
    }

    if (response.ok) {
      return (response.status === 204 ? undefined : await response.json()) as T;
    }

    const body = (await response.json().catch(() => null)) as (ApiErrorBody & Record<string, unknown>) | null;
    lastError = new ApiClientError(
      response.status,
      body?.error?.code ?? "internal_error",
      body?.error?.message ?? "Something went wrong. Please try again.",
      body?.error?.details,
      body,
    );
    if (response.status === 401 && !signingOut && typeof window !== "undefined") {
      window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
    if (!RETRYABLE.has(response.status)) break;
  }
  throw lastError!;
}

/** Fetches every page of a collection (MVP volumes; 200 per request). */
export async function listAll<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null = null;
  const separator = path.includes("?") ? "&" : "?";
  do {
    const page: Page<T> = await api<Page<T>>(`${path}${separator}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { signal });
    items.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return items;
}

/** A user-facing message for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  return "Something went wrong. Please try again.";
}
