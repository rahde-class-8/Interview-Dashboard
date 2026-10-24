import "server-only";

import type { Page } from "@/shared/contracts/common";
import { ApiError } from "./errors";

/**
 * Offset pagination behind an opaque cursor. Simple and adequate for MVP volumes;
 * rows inserted while paging can shift results (documented in API.md).
 */
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    if (typeof parsed.o === "number" && Number.isInteger(parsed.o) && parsed.o >= 0 && parsed.o <= 1_000_000) {
      return parsed.o;
    }
  } catch {
    // fall through
  }
  throw new ApiError(400, "validation_failed", "Invalid cursor.", [{ path: "cursor", message: "Invalid cursor." }]);
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

/** Range to request: one extra row tells us whether another page exists. */
export function pageRange(limit: number, offset: number): [number, number] {
  return [offset, offset + limit];
}

export function toPage<Row, T>(rows: Row[], limit: number, offset: number, map: (row: Row) => T): Page<T> {
  const hasMore = rows.length > limit;
  return {
    data: rows.slice(0, limit).map(map),
    nextCursor: hasMore ? encodeCursor(offset + limit) : null,
  };
}
