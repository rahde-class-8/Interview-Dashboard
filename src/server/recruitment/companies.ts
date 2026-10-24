import "server-only";

import { companyCreateSchema, companyListQuerySchema, companyUpdateSchema, type Company } from "@/shared/contracts/companies";
import { crud, pickDefined } from "../core/crud";
import type { Row } from "../core/rows";
import { containsPattern } from "../core/search";

export function toCompany(row: Row<"companies">): Company {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    industry: row.industry,
    headquarters: row.headquarters,
    website: row.website,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = { name: "name", industry: "industry", headquarters: "headquarters", website: "website" };

export const companies = crud({
  table: "companies",
  resource: "Company",
  toDto: toCompany,
  listQuery: companyListQuerySchema,
  applyList: (query, params) => {
    if (params.q) query = query.ilike("name", containsPattern(params.q));
    return query.order("name", { ascending: true }).order("id");
  },
  createSchema: companyCreateSchema,
  toInsert: (input) => pickDefined(input, COLUMNS),
  updateSchema: companyUpdateSchema,
  toUpdate: (input) => pickDefined(input, COLUMNS),
});
