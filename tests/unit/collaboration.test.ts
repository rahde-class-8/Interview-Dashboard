import { describe, expect, it } from "vitest";

import { describeActivity, humanize } from "@/server/collaboration/activity-summary";
import { effectiveStatus, newInvitationToken } from "@/server/collaboration/invitations";
import { invitationCreateSchema, invitationTokenSchema, memberUpdateSchema, noteUpdateSchema } from "@/shared/contracts/collaboration";

describe("activity summaries", () => {
  it("describes events from labels", () => {
    expect(describeActivity("opportunity.stage_changed", { title: "SRE", company: "Acme", from: "recruiter_screen", to: "technical" }, "Alex")).toBe(
      "Alex moved “SRE” at Acme from Recruiter screen to Technical",
    );
    expect(describeActivity("member.role_changed", { name: "Sam", from: "viewer", to: "editor" }, "Alex")).toBe(
      "Alex changed Sam's role from viewer to editor",
    );
    expect(describeActivity("workspace.retention_changed", { days: null }, "Alex")).toBe("Alex set recordings to be kept until deleted");
    expect(describeActivity("recording.expired", { title: "SRE" }, null)).toBe("A recording for “SRE” was deleted by the retention policy");
  });

  it("falls back for unknown actors and actions", () => {
    expect(describeActivity("note.created", { title: "Plan" }, null)).toBe("Someone created the note “Plan”");
    expect(describeActivity("something.new", {}, "Alex")).toBe("Alex made a change");
    expect(humanize("hiring_manager")).toBe("Hiring manager");
    expect(humanize(null)).toBe("");
  });
});

describe("invitations", () => {
  it("creates 256-bit URL-safe tokens and stores only their SHA-256", () => {
    const a = newInvitationToken();
    const b = newInvitationToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.hashHex).toMatch(/^[0-9a-f]{64}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hashHex).not.toContain(a.token);
  });

  it("reports pending invitations past their expiry as expired", () => {
    const now = Date.parse("2026-10-25T12:00:00Z");
    expect(effectiveStatus({ status: "pending", expires_at: "2026-10-25T11:59:59Z" }, now)).toBe("expired");
    expect(effectiveStatus({ status: "pending", expires_at: "2026-10-26T00:00:00Z" }, now)).toBe("pending");
    expect(effectiveStatus({ status: "revoked", expires_at: "2026-10-26T00:00:00Z" }, now)).toBe("revoked");
  });

  it("validates invitation input; ownership cannot be granted", () => {
    expect(invitationCreateSchema.parse({ email: "  Dana@Example.COM ", role: "editor" })).toEqual({ email: "dana@example.com", role: "editor" });
    expect(invitationCreateSchema.safeParse({ email: "dana@example.com", role: "owner" }).success).toBe(false);
    expect(invitationCreateSchema.safeParse({ email: "not-an-email", role: "viewer" }).success).toBe(false);
    expect(memberUpdateSchema.safeParse({ role: "owner" }).success).toBe(false);
    expect(invitationTokenSchema.safeParse({ token: "short" }).success).toBe(false);
  });
});

describe("note updates", () => {
  it("require the base version and at least one change", () => {
    expect(noteUpdateSchema.safeParse({ body: "x" }).success).toBe(false);
    expect(noteUpdateSchema.safeParse({ version: 2 }).success).toBe(false);
    expect(noteUpdateSchema.safeParse({ body: "x", version: 2 }).success).toBe(true);
    expect(noteUpdateSchema.safeParse({ title: " ", version: 2 }).success).toBe(false);
  });
});
