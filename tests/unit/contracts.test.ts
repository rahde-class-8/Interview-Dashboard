import { describe, expect, it } from "vitest";

import { callCreateSchema, callUpdateSchema } from "@/shared/contracts/calls";
import { labelList } from "@/shared/contracts/common";
import { companyCreateSchema } from "@/shared/contracts/companies";
import { followUpListQuerySchema } from "@/shared/contracts/follow-ups";
import { opportunityCreateSchema, opportunityListQuerySchema, opportunityUpdateSchema } from "@/shared/contracts/opportunities";

const call = {
  opportunity: { id: "3f0e8a7c-5b2d-4c1e-9a6f-0b1c2d3e4f5a" },
  callAt: "2026-10-17T14:00:00Z",
  durationMinutes: 30,
  interestLevel: 7,
};

describe("labelList", () => {
  it("trims, drops case-insensitive duplicates and enforces limits", () => {
    expect(labelList().parse([" AWS ", "aws", "Terraform"])).toEqual(["AWS", "Terraform"]);
    expect(labelList(2).safeParse(["a", "b", "c"]).success).toBe(false);
    expect(labelList().safeParse([""]).success).toBe(false);
  });
});

describe("companies", () => {
  it("normalizes empty optional text to null", () => {
    expect(companyCreateSchema.parse({ name: "X", industry: "", website: "" })).toEqual({ name: "X", industry: null, website: null });
  });
});

describe("opportunities", () => {
  it("requires a company reference by id or name", () => {
    const base = { title: "T", workMode: "remote", employmentType: "full_time" };
    expect(opportunityCreateSchema.safeParse(base).success).toBe(false);
    expect(opportunityCreateSchema.safeParse({ ...base, company: { name: "Acme" } }).success).toBe(true);
    expect(opportunityCreateSchema.safeParse({ ...base, company: { id: "nope" } }).success).toBe(false);
  });

  it("defaults compensation currency to USD and validates the range", () => {
    const parsed = opportunityCreateSchema.parse({
      title: "T", workMode: "remote", employmentType: "full_time", company: { name: "A" },
      compensation: { min: 1, max: 2, period: "hour" },
    });
    expect(parsed.compensation?.currency).toBe("USD");
  });

  it("rejects empty PATCH bodies", () => {
    expect(opportunityUpdateSchema.safeParse({}).success).toBe(false);
    expect(opportunityUpdateSchema.safeParse({ stage: "offer" }).success).toBe(true);
  });

  it("parses comma-separated stage filters", () => {
    expect(opportunityListQuerySchema.parse({ stage: "offer,closed" }).stage).toEqual(["offer", "closed"]);
    expect(opportunityListQuerySchema.safeParse({ stage: "offer,nope" }).success).toBe(false);
    expect(opportunityListQuerySchema.parse({}).sort).toBe("updated");
  });
});

describe("calls", () => {
  it("accepts a minimal call and defaults answers", () => {
    const parsed = callCreateSchema.parse({ ...call, candidateQuestions: [{ question: "On-call?" }] });
    expect(parsed.candidateQuestions).toEqual([{ question: "On-call?", answer: "" }]);
  });

  it.each([
    [{ interestLevel: 0 }, "interestLevel"],
    [{ durationMinutes: 601 }, "durationMinutes"],
    [{ callAt: "2026-10-17" }, "callAt"],
    [{ followUp: { title: "", dueDate: "2026-10-20" } }, "followUp.title"],
  ])("rejects %j", (patch, path) => {
    const result = callCreateSchema.safeParse({ ...call, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path.join(".")).toBe(path);
  });

  it("rejects unknown keys in opportunity references (strict)", () => {
    expect(callCreateSchema.safeParse({ ...call, opportunity: { id: call.opportunity.id, extra: 1 } }).success).toBe(false);
  });

  it("allows followUp null on update and rejects empty updates", () => {
    expect(callUpdateSchema.safeParse({ followUp: null }).success).toBe(true);
    expect(callUpdateSchema.safeParse({}).success).toBe(false);
  });
});

describe("follow-up list query", () => {
  it("validates asOf as a calendar date", () => {
    expect(followUpListQuerySchema.parse({ due: "overdue", asOf: "2026-10-24" }).asOf).toBe("2026-10-24");
    expect(followUpListQuerySchema.safeParse({ asOf: "10/24/2026" }).success).toBe(false);
  });
});
