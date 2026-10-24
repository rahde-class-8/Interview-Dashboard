import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { opportunities } from "@/server/recruitment/opportunities";

export const GET = withApi<ItemParams>(opportunities.get);
export const PATCH = withApi<ItemParams>(opportunities.update);
export const DELETE = withApi<ItemParams>(opportunities.remove);
