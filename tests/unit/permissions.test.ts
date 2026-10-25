import { describe, expect, it } from "vitest";

import { canDeleteRecording, commentPermissions, hasRole, permissionsFor } from "@/lib/permissions";

describe("permission helpers (mirror of the server rules)", () => {
  it("ranks roles owner > editor > commenter > viewer", () => {
    expect(hasRole("owner", "editor")).toBe(true);
    expect(hasRole("editor", "editor")).toBe(true);
    expect(hasRole("commenter", "editor")).toBe(false);
    expect(hasRole("viewer", "commenter")).toBe(false);
  });

  it.each([
    ["owner", { canEdit: true, canComment: true, canPlayRecordings: true, isOwner: true }],
    ["editor", { canEdit: true, canComment: true, canPlayRecordings: true, isOwner: false }],
    ["commenter", { canEdit: false, canComment: true, canPlayRecordings: false, isOwner: false }],
    ["viewer", { canEdit: false, canComment: false, canPlayRecordings: false, isOwner: false }],
  ] as const)("%s", (role, expected) => {
    expect(permissionsFor(role)).toEqual({ role, ...expected });
  });

  it("recordings: owners delete any, editors only their own, others none", () => {
    expect(canDeleteRecording("owner", false)).toBe(true);
    expect(canDeleteRecording("editor", true)).toBe(true);
    expect(canDeleteRecording("editor", false)).toBe(false);
    expect(canDeleteRecording("commenter", true)).toBe(false);
  });

  it("comments: authors edit and delete, owners only delete others'", () => {
    expect(commentPermissions("commenter", true)).toEqual({ canEdit: true, canDelete: true });
    expect(commentPermissions("owner", false)).toEqual({ canEdit: false, canDelete: true });
    expect(commentPermissions("editor", false)).toEqual({ canEdit: false, canDelete: false });
    expect(commentPermissions("viewer", true)).toEqual({ canEdit: false, canDelete: false });
  });
});
