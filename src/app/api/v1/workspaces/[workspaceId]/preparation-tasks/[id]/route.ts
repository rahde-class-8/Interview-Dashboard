import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { preparationTasks } from "@/server/preparation/tasks";

export const GET = withApi<ItemParams>(preparationTasks.get);
export const PATCH = withApi<ItemParams>(preparationTasks.update);
export const DELETE = withApi<ItemParams>(preparationTasks.remove);
