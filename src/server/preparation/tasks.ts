import "server-only";

import {
  preparationTaskCreateSchema,
  preparationTaskListQuerySchema,
  preparationTaskUpdateSchema,
  type PreparationTask,
} from "@/shared/contracts/preparation";
import { crud, pickDefined } from "../core/crud";
import type { Row } from "../core/rows";

export function toPreparationTask(row: Row<"preparation_tasks">): PreparationTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    opportunityId: row.opportunity_id,
    title: row.title,
    category: row.category as PreparationTask["category"],
    dueDate: row.due_date,
    completed: row.completed_at !== null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** `completed` toggles the completion timestamp. */
export function completionColumns(completed: boolean | undefined) {
  if (completed === undefined) return {};
  return { completed_at: completed ? new Date().toISOString() : null };
}

export const preparationTasks = crud({
  table: "preparation_tasks",
  resource: "Preparation task",
  toDto: toPreparationTask,
  listQuery: preparationTaskListQuerySchema,
  applyList: (query, params) => {
    if (params.opportunityId) query = query.eq("opportunity_id", params.opportunityId);
    if (params.category) query = query.eq("category", params.category);
    if (params.status === "pending") query = query.is("completed_at", null);
    if (params.status === "completed") query = query.not("completed_at", "is", null);
    return query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at").order("id");
  },
  createSchema: preparationTaskCreateSchema,
  toInsert: (input, ctx) => ({
    opportunity_id: input.opportunityId,
    title: input.title,
    category: input.category,
    due_date: input.dueDate ?? null,
    created_by: ctx.userId,
  }),
  updateSchema: preparationTaskUpdateSchema,
  toUpdate: (input) => ({
    ...pickDefined(input, { title: "title", category: "category", dueDate: "due_date" }),
    ...completionColumns(input.completed),
  }),
});
