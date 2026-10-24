import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { calls } from "@/server/recruitment/calls";

export const GET = withApi<WorkspaceParams>(calls.list);
export const POST = withApi<WorkspaceParams>(calls.create);
