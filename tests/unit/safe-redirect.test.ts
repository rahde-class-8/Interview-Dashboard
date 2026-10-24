import { describe, expect, it } from "vitest";

import { matchesPath, safeNextPath } from "@/lib/safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/calls", "/calls"],
    ["/calls/123?tab=recording", "/calls/123?tab=recording"],
    ["/opportunities?stage=offer#top", "/opportunities?stage=offer#top"],
  ])("allows same-origin path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example.com",
    "//evil.example.com/path",
    "/\\evil.example.com",
    "\\\\evil.example.com",
    "javascript:alert(1)",
    "calls",
    "/calls\nSet-Cookie: x=1",
    "/login",
    "/register?x=1",
    "/auth/confirm?token_hash=x",
    "",
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });

  it("uses the provided fallback", () => {
    expect(safeNextPath(null, "/calls")).toBe("/calls");
    expect(safeNextPath("https://x.example", "")).toBe("");
  });

  it("rejects overly long values", () => {
    expect(safeNextPath(`/${"a".repeat(3000)}`)).toBe("/");
  });
});

describe("matchesPath", () => {
  it("matches exact paths and sub-paths only", () => {
    expect(matchesPath("/login", ["/login"])).toBe(true);
    expect(matchesPath("/auth/confirm", ["/auth"])).toBe(true);
    expect(matchesPath("/login-help", ["/login"])).toBe(false);
    expect(matchesPath("/authors", ["/auth"])).toBe(false);
  });
});
