import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { recruiters } from "@/server/recruitment/recruiters";

export const GET = withApi<WorkspaceParams>(recruiters.list);
export const POST = withApi<WorkspaceParams>(recruiters.create);
