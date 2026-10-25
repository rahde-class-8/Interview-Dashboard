import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { activity } from "@/server/collaboration/activity";

export const GET = withApi<WorkspaceParams>(activity.list);
