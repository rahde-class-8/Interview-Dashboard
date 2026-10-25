import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { comments } from "@/server/collaboration/comments";

export const GET = withApi<WorkspaceParams>(comments.listForWorkspace);
