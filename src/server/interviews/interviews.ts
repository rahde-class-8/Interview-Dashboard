import "server-only";

import {
  interviewCreateSchema,
  interviewListQuerySchema,
  interviewUpdateSchema,
  type Interview,
} from "@/shared/contracts/interviews";
import { crud, pickDefined } from "../core/crud";
import type { Row } from "../core/rows";

type InterviewRow = Row<"interviews"> & {
  opportunity: { id: string; title: string; company: { name: string } | null } | null;
};

const SELECT =
  "*, opportunity:opportunities!interviews_opportunity_id_workspace_id_fkey(id, title, company:companies!opportunities_company_id_workspace_id_fkey(name))";

export function toInterview(row: InterviewRow): Interview {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    opportunityId: row.opportunity_id,
    opportunity: {
      id: row.opportunity_id,
      title: row.opportunity?.title ?? "",
      companyName: row.opportunity?.company?.name ?? "",
    },
    title: row.title,
    stage: row.stage as Interview["stage"],
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    format: row.format as Interview["format"],
    interviewers: row.interviewers,
    status: row.status as Interview["status"],
    outcome: row.outcome as Interview["outcome"],
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = {
  title: "title",
  stage: "stage",
  scheduledAt: "scheduled_at",
  durationMinutes: "duration_minutes",
  format: "format",
  interviewers: "interviewers",
  status: "status",
  outcome: "outcome",
  notes: "notes",
};

export const interviews = crud({
  table: "interviews",
  resource: "Interview",
  select: SELECT,
  toDto: toInterview,
  listQuery: interviewListQuerySchema,
  applyList: (query, params) => {
    if (params.opportunityId) query = query.eq("opportunity_id", params.opportunityId);
    if (params.status) query = query.eq("status", params.status);
    if (params.upcoming === "true") query = query.eq("status", "scheduled").gte("scheduled_at", new Date().toISOString());
    if (params.from) query = query.gte("scheduled_at", params.from);
    if (params.to) query = query.lt("scheduled_at", params.to);
    return query.order("scheduled_at", { ascending: params.order === "asc" }).order("id");
  },
  createSchema: interviewCreateSchema,
  toInsert: (input, ctx) => ({
    ...pickDefined(input, COLUMNS),
    opportunity_id: input.opportunityId,
    created_by: ctx.userId,
  }),
  updateSchema: interviewUpdateSchema,
  toUpdate: (input) => pickDefined(input, COLUMNS),
});
