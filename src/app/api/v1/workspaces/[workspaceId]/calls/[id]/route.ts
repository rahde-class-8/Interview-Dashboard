import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { calls } from "@/server/recruitment/calls";

export const GET = withApi<ItemParams>(calls.get);
export const PATCH = withApi<ItemParams>(calls.update);
export const DELETE = withApi<ItemParams>(calls.remove);
