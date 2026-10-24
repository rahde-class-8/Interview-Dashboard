import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { followUps } from "@/server/followups/follow-ups";

export const GET = withApi<WorkspaceParams>(followUps.list);
export const POST = withApi<WorkspaceParams>(followUps.create);
