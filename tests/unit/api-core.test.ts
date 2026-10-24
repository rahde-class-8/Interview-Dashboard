import { describe, expect, it } from "vitest";

import { ApiError, fromDatabaseError } from "@/server/core/errors";
import { decodeCursor, encodeCursor, toPage } from "@/server/core/pagination";
import { containsPattern, quoteFilterValue } from "@/server/core/search";

describe("fromDatabaseError", () => {
  it.each([
    [{ code: "23505" }, 409, "conflict"],
    [{ code: "23503", message: 'insert or update on table "x" violates foreign key constraint' }, 400, "invalid_reference"],
    [{ code: "23503", message: 'update or delete on table "companies" violates foreign key constraint' }, 409, "in_use"],
    [{ code: "23514" }, 400, "validation_failed"],
    [{ code: "22P02" }, 400, "validation_failed"],
    [{ code: "42501" }, 403, "forbidden"],
    [{ code: "PGRST116" }, 404, "not_found"],
    [{ code: "P0002", message: "Recruiter not found" }, 404, "not_found"],
    [{ code: "P0001", message: "The workspace owner cannot be removed" }, 409, "conflict"],
    [{ code: "XX000", message: "connection to 10.0.0.1 failed" }, 500, "internal_error"],
  ])("maps %j to %i %s", (error, status, code) => {
    const mapped = fromDatabaseError(error, "Company");
    expect(mapped).toBeInstanceOf(ApiError);
    expect(mapped.status).toBe(status);
    expect(mapped.code).toBe(code);
  });

  it("never exposes raw database messages for generic errors", () => {
    const mapped = fromDatabaseError({ code: "23505", message: 'duplicate key value violates unique constraint "companies_name_per_workspace"' });
    expect(mapped.message).not.toMatch(/constraint|companies_/);
    expect(fromDatabaseError({ code: "XX000", message: "secret internals" }).message).not.toMatch(/secret/);
  });

  it("uses our own function messages for P0002", () => {
    expect(fromDatabaseError({ code: "P0002", message: "Opportunity not found" }).message).toBe("Opportunity not found.");
  });
});

describe("cursor pagination", () => {
  it("round-trips offsets", () => {
    expect(decodeCursor(encodeCursor(150))).toBe(150);
    expect(decodeCursor(undefined)).toBe(0);
  });

  it.each(["garbage", Buffer.from('{"o":-1}').toString("base64url"), Buffer.from('{"o":"10"}').toString("base64url")])(
    "rejects invalid cursor %s",
    (cursor) => {
      expect(() => decodeCursor(cursor)).toThrow(ApiError);
    },
  );

  it("detects the next page from the extra row", () => {
    const rows = [1, 2, 3];
    expect(toPage(rows, 2, 0, (n) => n)).toEqual({ data: [1, 2], nextCursor: encodeCursor(2) });
    expect(toPage(rows, 3, 0, (n) => n)).toEqual({ data: [1, 2, 3], nextCursor: null });
  });
});

describe("search helpers", () => {
  it("escapes LIKE wildcards", () => {
    expect(containsPattern("100%")).toBe("%100\\%%");
    expect(containsPattern("a_b\\c")).toBe("%a\\_b\\\\c%");
  });

  it("quotes values for PostgREST or() filters", () => {
    expect(quoteFilterValue("a,b)")).toBe('"a,b)"');
    expect(quoteFilterValue('say "hi"\\')).toBe('"say \\"hi\\"\\\\"');
  });
});
