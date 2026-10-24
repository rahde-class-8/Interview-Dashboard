import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { preparationTasks } from "@/server/preparation/tasks";

export const GET = withApi<WorkspaceParams>(preparationTasks.list);
export const POST = withApi<WorkspaceParams>(preparationTasks.create);
