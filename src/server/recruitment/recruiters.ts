import "server-only";

import {
  recruiterCreateSchema,
  recruiterListQuerySchema,
  recruiterUpdateSchema,
  type Recruiter,
} from "@/shared/contracts/recruiters";
import { crud, pickDefined } from "../core/crud";
import type { Row } from "../core/rows";
import { containsPattern, quoteFilterValue } from "../core/search";

export function toRecruiter(row: Row<"recruiters">): Recruiter {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    companyId: row.company_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    agency: row.agency,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const RECRUITER_COLUMNS = { name: "name", email: "email", phone: "phone", agency: "agency", companyId: "company_id" };

export const recruiters = crud({
  table: "recruiters",
  resource: "Recruiter",
  toDto: toRecruiter,
  listQuery: recruiterListQuerySchema,
  applyList: (query, params) => {
    if (params.companyId) query = query.eq("company_id", params.companyId);
    if (params.q) {
      const value = quoteFilterValue(containsPattern(params.q));
      query = query.or(`name.ilike.${value},email.ilike.${value},agency.ilike.${value}`);
    }
    return query.order("name", { ascending: true }).order("id");
  },
  createSchema: recruiterCreateSchema,
  toInsert: (input) => pickDefined(input, RECRUITER_COLUMNS),
  updateSchema: recruiterUpdateSchema,
  toUpdate: (input) => pickDefined(input, RECRUITER_COLUMNS),
});
