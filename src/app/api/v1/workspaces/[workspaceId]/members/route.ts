import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { members } from "@/server/collaboration/members";

export const GET = withApi<WorkspaceParams>(members.list);
