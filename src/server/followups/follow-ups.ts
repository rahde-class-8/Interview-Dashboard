import "server-only";

import {
  followUpCreateSchema,
  followUpListQuerySchema,
  followUpUpdateSchema,
  type FollowUp,
} from "@/shared/contracts/follow-ups";
import { crud, pickDefined } from "../core/crud";
import type { Row } from "../core/rows";
import { completionColumns } from "../preparation/tasks";

export function toFollowUp(row: Row<"follow_up_tasks">): FollowUp {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    opportunityId: row.opportunity_id,
    callId: row.recruiter_call_id,
    title: row.title,
    dueDate: row.due_date,
    completed: row.completed_at !== null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Today's date in UTC as YYYY-MM-DD (clients should pass their local date as asOf). */
export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

export const followUps = crud({
  table: "follow_up_tasks",
  resource: "Follow-up",
  toDto: toFollowUp,
  listQuery: followUpListQuerySchema,
  applyList: (query, params) => {
    const asOf = params.asOf ?? utcToday();
    if (params.opportunityId) query = query.eq("opportunity_id", params.opportunityId);
    if (params.due === "upcoming") query = query.is("completed_at", null).gte("due_date", asOf);
    else if (params.due === "overdue") query = query.is("completed_at", null).lt("due_date", asOf);
    else if (params.status === "pending") query = query.is("completed_at", null);
    else if (params.status === "completed") query = query.not("completed_at", "is", null);
    return query.order("due_date", { ascending: true }).order("id");
  },
  createSchema: followUpCreateSchema,
  toInsert: (input, ctx) => ({
    opportunity_id: input.opportunityId,
    title: input.title,
    due_date: input.dueDate,
    created_by: ctx.userId,
  }),
  updateSchema: followUpUpdateSchema,
  toUpdate: (input) => ({
    ...pickDefined(input, { title: "title", dueDate: "due_date" }),
    ...completionColumns(input.completed),
  }),
});
