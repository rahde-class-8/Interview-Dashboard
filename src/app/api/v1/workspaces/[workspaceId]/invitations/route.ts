import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { invitations } from "@/server/collaboration/invitations";

export const GET = withApi<WorkspaceParams>(invitations.list);
export const POST = withApi<WorkspaceParams>(invitations.create);
