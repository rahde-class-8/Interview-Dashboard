import "server-only";

import {
  questionCreateSchema,
  questionListQuerySchema,
  questionUpdateSchema,
  type Question,
} from "@/shared/contracts/preparation";
import { crud, pickDefined } from "../core/crud";
import type { Row } from "../core/rows";
import { containsPattern, quoteFilterValue } from "../core/search";

export function toQuestion(row: Row<"questions">): Question {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    type: row.type as Question["type"],
    topic: row.topic,
    difficulty: row.difficulty as Question["difficulty"],
    question: row.question,
    answerNotes: row.answer_notes,
    companyId: row.company_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = {
  type: "type",
  topic: "topic",
  difficulty: "difficulty",
  question: "question",
  answerNotes: "answer_notes",
  companyId: "company_id",
};

export const questions = crud({
  table: "questions",
  resource: "Question",
  toDto: toQuestion,
  listQuery: questionListQuerySchema,
  applyList: (query, params) => {
    if (params.type) query = query.eq("type", params.type);
    if (params.topic) query = query.eq("topic", params.topic);
    if (params.difficulty) query = query.eq("difficulty", params.difficulty);
    if (params.companyId === "general") query = query.is("company_id", null);
    else if (params.companyId) query = query.eq("company_id", params.companyId);
    if (params.q) {
      const value = quoteFilterValue(containsPattern(params.q));
      query = query.or(`question.ilike.${value},answer_notes.ilike.${value},topic.ilike.${value}`);
    }
    return query.order("created_at", { ascending: false }).order("id");
  },
  createSchema: questionCreateSchema,
  toInsert: (input, ctx) => ({ ...pickDefined(input, COLUMNS), created_by: ctx.userId }),
  updateSchema: questionUpdateSchema,
  toUpdate: (input) => pickDefined(input, COLUMNS),
});
