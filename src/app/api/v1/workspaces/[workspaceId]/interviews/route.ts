import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { interviews } from "@/server/interviews/interviews";

export const GET = withApi<WorkspaceParams>(interviews.list);
export const POST = withApi<WorkspaceParams>(interviews.create);
