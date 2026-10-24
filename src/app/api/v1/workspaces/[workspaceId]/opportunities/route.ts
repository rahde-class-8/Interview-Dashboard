import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { opportunities } from "@/server/recruitment/opportunities";

export const GET = withApi<WorkspaceParams>(opportunities.list);
export const POST = withApi<WorkspaceParams>(opportunities.create);
