import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { workspaces } from "@/server/workspaces/workspaces";

export const GET = withApi<WorkspaceParams>(workspaces.get);
export const PATCH = withApi<WorkspaceParams>(workspaces.update);
export const DELETE = withApi<WorkspaceParams>(workspaces.remove);
