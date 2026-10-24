import "server-only";

import {
  starStoryCreateSchema,
  starStoryListQuerySchema,
  starStoryUpdateSchema,
  type StarStory,
} from "@/shared/contracts/preparation";
import { crud, pickDefined } from "../core/crud";
import type { Row } from "../core/rows";
import { containsPattern, quoteFilterValue } from "../core/search";

export function toStarStory(row: Row<"star_stories">): StarStory {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    situation: row.situation,
    task: row.task,
    action: row.action,
    result: row.result,
    themes: row.themes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = { title: "title", situation: "situation", task: "task", action: "action", result: "result", themes: "themes" };

export const starStories = crud({
  table: "star_stories",
  resource: "STAR story",
  toDto: toStarStory,
  listQuery: starStoryListQuerySchema,
  applyList: (query, params) => {
    if (params.q) {
      const value = quoteFilterValue(containsPattern(params.q));
      query = query.or(`title.ilike.${value},situation.ilike.${value},result.ilike.${value}`);
    }
    return query.order("updated_at", { ascending: false }).order("id");
  },
  createSchema: starStoryCreateSchema,
  toInsert: (input, ctx) => ({ ...pickDefined(input, COLUMNS), created_by: ctx.userId }),
  updateSchema: starStoryUpdateSchema,
  toUpdate: (input) => pickDefined(input, COLUMNS),
});
