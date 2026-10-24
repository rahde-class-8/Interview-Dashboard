import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { interviews } from "@/server/interviews/interviews";

export const GET = withApi<ItemParams>(interviews.get);
export const PATCH = withApi<ItemParams>(interviews.update);
export const DELETE = withApi<ItemParams>(interviews.remove);
