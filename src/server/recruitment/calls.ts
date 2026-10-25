import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";

import { callCreateSchema, callListQuerySchema, callUpdateSchema, type Call, type CallSummary } from "@/shared/contracts/calls";
import { check, json, parseId, readBody, requireWorkspace, type ApiContext } from "../core/api";
import { crud, pickDefined, type ItemParams, type ListContext, type WorkspaceParams } from "../core/crud";
import type { Row } from "../core/rows";
import { containsPattern, quoteFilterValue } from "../core/search";
import { toOpportunityData, toRecruiterRef } from "./payloads";

type FollowUpEmbed = { id: string; title: string; due_date: string; completed_at: string | null };

type CallRow = Row<"recruiter_calls"> & {
  opportunity: { id: string; title: string; stage: string; company: { id: string; name: string } | null } | null;
  recruiter: { id: string; name: string; email: string | null; phone: string | null; agency: string | null } | null;
  // PostgREST returns this as an array: the unique index is on recruiter_call_id alone while
  // the foreign key is composite, so the relationship is not detected as one-to-one.
  follow_up: FollowUpEmbed[] | FollowUpEmbed | null;
  recording_count: number;
};

const RELATIONS = [
  "opportunity:opportunities!recruiter_calls_opportunity_id_workspace_id_fkey(id, title, stage, company:companies!opportunities_company_id_workspace_id_fkey(id, name))",
  "recruiter:recruiters!recruiter_calls_recruiter_id_workspace_id_fkey(id, name, email, phone, agency)",
  "follow_up:follow_up_tasks!follow_up_tasks_recruiter_call_id_workspace_id_fkey(id, title, due_date, completed_at)",
  // Uploaded (playable) recordings only; see public.uploaded_recording_count.
  "recording_count:uploaded_recording_count",
].join(", ");

/** A UUID no row has: used to express "match nothing" in filters. */
const NONE = "00000000-0000-0000-0000-000000000000";
const orNone = (ids: string[]) => (ids.length ? ids : [NONE]);

const DETAIL_SELECT = `*, ${RELATIONS}`;
const SUMMARY_SELECT = `id, workspace_id, call_at, duration_minutes, interest_level, technical_topics, created_at, updated_at, ${RELATIONS}`;

function toFollowUpSummary(f: FollowUpEmbed | null | undefined): CallSummary["followUp"] {
  return f ? { id: f.id, title: f.title, dueDate: f.due_date, completed: f.completed_at !== null } : null;
}

export function toCallSummary(row: CallRow): CallSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    callAt: row.call_at,
    durationMinutes: row.duration_minutes,
    interestLevel: row.interest_level,
    technicalTopics: row.technical_topics,
    opportunity: {
      id: row.opportunity?.id ?? row.opportunity_id,
      title: row.opportunity?.title ?? "",
      stage: (row.opportunity?.stage ?? "new") as CallSummary["opportunity"]["stage"],
      company: { id: row.opportunity?.company?.id ?? "", name: row.opportunity?.company?.name ?? "" },
    },
    recruiter: row.recruiter,
    followUp: toFollowUpSummary(Array.isArray(row.follow_up) ? row.follow_up[0] : row.follow_up),
    recordingCount: row.recording_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toCall(row: CallRow): Call {
  return {
    ...toCallSummary(row),
    hiringManagerPriorities: row.hiring_manager_priorities,
    interviewStages: row.interview_stages,
    recruiterAdvice: row.recruiter_advice,
    behavioralThemes: row.behavioral_themes,
    redFlags: row.red_flags,
    candidateQuestions: (row.candidate_questions as { question: string; answer?: string }[]).map((q) => ({
      question: q.question,
      answer: q.answer ?? "",
    })),
    notes: row.notes,
  };
}

const CALL_COLUMNS = {
  callAt: "call_at",
  durationMinutes: "duration_minutes",
  interestLevel: "interest_level",
  hiringManagerPriorities: "hiring_manager_priorities",
  interviewStages: "interview_stages",
  recruiterAdvice: "recruiter_advice",
  technicalTopics: "technical_topics",
  behavioralThemes: "behavioral_themes",
  redFlags: "red_flags",
  candidateQuestions: "candidate_questions",
  notes: "notes",
};

const detail = crud({
  table: "recruiter_calls",
  resource: "Recruiter call",
  select: DETAIL_SELECT,
  toDto: (row: CallRow) => toCall(row),
  listQuery: callListQuerySchema,
  applyList: (query) => query,
  createSchema: callCreateSchema,
  toInsert: () => ({}),
  updateSchema: callUpdateSchema,
  toUpdate: () => ({}),
});

const listConfig = {
  table: "recruiter_calls",
  resource: "Recruiter call",
  listQuery: callListQuerySchema,
  resolveList: async (params, ctx) => {
    const ws = ctx.params.workspaceId;
    const resolved: ListContext = {};
    if (params.stage) {
      resolved.stageOpportunityIds = check(
        await ctx.supabase.from("opportunities").select("id").eq("workspace_id", ws).eq("stage", params.stage),
      ).map((o) => o.id);
    }
    if (params.q) {
      // Search recruiter name, company name and job title (resolved to ids first).
      const pattern = containsPattern(params.q);
      const [recruiters, companies] = await Promise.all([
        ctx.supabase.from("recruiters").select("id").eq("workspace_id", ws).ilike("name", pattern).limit(500),
        ctx.supabase.from("companies").select("id").eq("workspace_id", ws).ilike("name", pattern).limit(500),
      ]);
      const companyIds = check(companies).map((c) => c.id);
      const oppFilter = [`title.ilike.${quoteFilterValue(pattern)}`];
      if (companyIds.length) oppFilter.push(`company_id.in.(${companyIds.join(",")})`);
      resolved.searchOpportunityIds = check(
        await ctx.supabase.from("opportunities").select("id").eq("workspace_id", ws).or(oppFilter.join(",")).limit(1000),
      ).map((o) => o.id);
      resolved.searchRecruiterIds = check(recruiters).map((r) => r.id);
    }
    return resolved;
  },
  applyList: (query, params, resolved) => {
    if (params.opportunityId) query = query.eq("opportunity_id", params.opportunityId);
    if (params.recruiterId) query = query.eq("recruiter_id", params.recruiterId);
    if (params.from) query = query.gte("call_at", params.from);
    if (params.to) query = query.lt("call_at", params.to);
    if (resolved.stageOpportunityIds) query = query.in("opportunity_id", orNone(resolved.stageOpportunityIds));
    if (params.q) {
      const clauses: string[] = [];
      if (resolved.searchRecruiterIds?.length) clauses.push(`recruiter_id.in.(${resolved.searchRecruiterIds.join(",")})`);
      if (resolved.searchOpportunityIds?.length) clauses.push(`opportunity_id.in.(${resolved.searchOpportunityIds.join(",")})`);
      query = clauses.length ? query.or(clauses.join(",")) : query.eq("id", NONE);
    }
    return query.order("call_at", { ascending: false }).order("id");
  },
  createSchema: callCreateSchema,
  toInsert: () => ({}),
  updateSchema: callUpdateSchema,
  toUpdate: () => ({}),
} satisfies Omit<Parameters<typeof crud<CallRow, CallSummary, z.infer<typeof callListQuerySchema>, unknown, unknown>>[0], "select" | "toDto">;

const summaries = crud({ ...listConfig, select: SUMMARY_SELECT, toDto: (row: CallRow) => toCallSummary(row) });
/** Same filters, full call records (`?view=detail`), e.g. for loading a workspace into the client. */
const detailList = crud({ ...listConfig, select: DETAIL_SELECT, toDto: (row: CallRow) => toCall(row) });

function toPayload(input: Record<string, unknown> & {
  opportunity?: { create: Record<string, unknown> } | { id: string; update?: Record<string, unknown> };
  recruiter?: Parameters<typeof toRecruiterRef>[0];
  followUp?: { title: string; dueDate: string } | null;
}) {
  const payload: Record<string, unknown> = { call: pickDefined(input, CALL_COLUMNS) };
  if (input.opportunity) {
    payload.opportunity =
      "create" in input.opportunity
        ? { create: toOpportunityData(input.opportunity.create) }
        : input.opportunity.update
          ? { id: input.opportunity.id, update: toOpportunityData(input.opportunity.update) }
          : { id: input.opportunity.id };
  }
  if (input.recruiter !== undefined) payload.recruiter = toRecruiterRef(input.recruiter);
  if (input.followUp !== undefined) {
    payload.follow_up = input.followUp ? { title: input.followUp.title, due_date: input.followUp.dueDate } : null;
  }
  return payload;
}

async function save(ctx: ApiContext<WorkspaceParams>, callId: string | null, payload: Record<string, unknown>) {
  const result = check(
    await ctx.supabase.rpc("save_recruiter_call", {
      p_workspace_id: ctx.params.workspaceId,
      p_call_id: callId as string,
      p_payload: payload as never,
    }),
    "Recruiter call",
  ) as { call_id: string };
  return detail.fetchOne(ctx, result.call_id);
}

export const calls = {
  list(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    return request.nextUrl.searchParams.get("view") === "detail" ? detailList.list(request, ctx) : summaries.list(request, ctx);
  },
  get: detail.get,
  remove: detail.remove,

  async create(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const input = await readBody(request, callCreateSchema);
    return json(await save(ctx, null, toPayload(input)), 201);
  },

  async update(request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const id = parseId(ctx.params.id, "Recruiter call");
    const input = await readBody(request, callUpdateSchema);
    return json(await save(ctx, id, toPayload(input)));
  },
};
