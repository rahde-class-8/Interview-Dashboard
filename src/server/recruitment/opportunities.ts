import "server-only";

import type { NextRequest } from "next/server";

import {
  opportunityCreateSchema,
  opportunityListQuerySchema,
  opportunityUpdateSchema,
  stageChangeSchema,
  type Opportunity,
} from "@/shared/contracts/opportunities";
import { check, checkMaybe, json, parseId, readBody, requireWorkspace, type ApiContext } from "../core/api";
import { crud, type ItemParams, type WorkspaceParams } from "../core/crud";
import { notFound } from "../core/errors";
import type { Row } from "../core/rows";
import { containsPattern, quoteFilterValue } from "../core/search";
import { toOpportunityData, toRecruiterRef } from "./payloads";

type OpportunityRow = Row<"opportunities"> & {
  company: { id: string; name: string } | null;
  recruiter: { id: string; name: string } | null;
};

export const OPPORTUNITY_SELECT =
  "*, company:companies!opportunities_company_id_workspace_id_fkey(id, name), recruiter:recruiters!opportunities_recruiter_id_workspace_id_fkey(id, name)";

export function toOpportunity(row: OpportunityRow): Opportunity {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    location: row.location,
    workMode: row.work_mode as Opportunity["workMode"],
    employmentType: row.employment_type as Opportunity["employmentType"],
    compensation:
      row.comp_min !== null && row.comp_max !== null && row.comp_period
        ? { min: Number(row.comp_min), max: Number(row.comp_max), currency: row.comp_currency, period: row.comp_period as "year" | "hour" }
        : null,
    stage: row.stage as Opportunity["stage"],
    stageChangedAt: row.stage_changed_at,
    jobDescription: row.job_description,
    requiredSkills: row.required_skills,
    preferredSkills: row.preferred_skills,
    prepNotes: row.prep_notes,
    company: { id: row.company_id, name: row.company?.name ?? "" },
    recruiter: row.recruiter ? { id: row.recruiter.id, name: row.recruiter.name } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const base = crud({
  table: "opportunities",
  resource: "Opportunity",
  select: OPPORTUNITY_SELECT,
  toDto: toOpportunity,
  listQuery: opportunityListQuerySchema,
  resolveList: async (params, ctx) => {
    if (!params.q) return {};
    // Search also matches the company name: resolve matching companies to ids first.
    const companies = check(
      await ctx.supabase
        .from("companies")
        .select("id")
        .eq("workspace_id", ctx.params.workspaceId)
        .ilike("name", containsPattern(params.q))
        .limit(500),
    );
    return { companyIds: companies.map((c) => c.id) };
  },
  applyList: (query, params, resolved) => {
    if (params.stage?.length) query = query.in("stage", params.stage);
    if (params.companyId) query = query.eq("company_id", params.companyId);
    if (params.recruiterId) query = query.eq("recruiter_id", params.recruiterId);
    if (params.q) {
      const value = quoteFilterValue(containsPattern(params.q));
      const clauses = [`title.ilike.${value}`, `location.ilike.${value}`];
      if (resolved.companyIds?.length) clauses.push(`company_id.in.(${resolved.companyIds.join(",")})`);
      query = query.or(clauses.join(","));
    }
    const order = { updated: "updated_at", created: "created_at", title: "title" }[params.sort];
    return query.order(order, { ascending: params.sort === "title" }).order("id");
  },
  // Writes go through save_opportunity (transactional find-or-create of company/recruiter).
  createSchema: opportunityCreateSchema,
  toInsert: () => ({}),
  updateSchema: opportunityUpdateSchema,
  toUpdate: () => ({}),
});

async function save(ctx: ApiContext<WorkspaceParams>, opportunityId: string | null, payload: Record<string, unknown>) {
  const id = check(
    await ctx.supabase.rpc("save_opportunity", {
      p_workspace_id: ctx.params.workspaceId,
      p_opportunity_id: opportunityId as string,
      p_payload: payload as never,
    }),
    "Opportunity",
  );
  return base.fetchOne(ctx, id);
}

export const opportunities = {
  list: base.list,
  get: base.get,
  remove: base.remove,

  async create(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const input = await readBody(request, opportunityCreateSchema);
    const payload: Record<string, unknown> = { opportunity: toOpportunityData(input) };
    if (input.recruiter !== undefined) payload.recruiter = toRecruiterRef(input.recruiter);
    return json(await save(ctx, null, payload), 201);
  },

  async update(request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const id = parseId(ctx.params.id, "Opportunity");
    const input = await readBody(request, opportunityUpdateSchema);
    const payload: Record<string, unknown> = { opportunity: toOpportunityData(input) };
    if (input.recruiter !== undefined) payload.recruiter = toRecruiterRef(input.recruiter);
    return json(await save(ctx, id, payload));
  },

  /** PUT /opportunities/{id}/stage — move through the pipeline. */
  async setStage(request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const id = parseId(ctx.params.id, "Opportunity");
    const { stage } = await readBody(request, stageChangeSchema);
    const row = checkMaybe(
      await ctx.supabase
        .from("opportunities")
        .update({ stage })
        .eq("id", id)
        .eq("workspace_id", ctx.params.workspaceId)
        .select(OPPORTUNITY_SELECT)
        .maybeSingle(),
      "Opportunity",
    );
    if (!row) throw notFound("Opportunity");
    return json(toOpportunity(row as unknown as OpportunityRow));
  },
};
