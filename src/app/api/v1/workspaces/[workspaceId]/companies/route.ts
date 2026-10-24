import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { companies } from "@/server/recruitment/companies";

export const GET = withApi<WorkspaceParams>(companies.list);
export const POST = withApi<WorkspaceParams>(companies.create);
