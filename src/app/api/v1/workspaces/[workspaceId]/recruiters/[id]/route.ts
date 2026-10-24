import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { recruiters } from "@/server/recruitment/recruiters";

export const GET = withApi<ItemParams>(recruiters.get);
export const PATCH = withApi<ItemParams>(recruiters.update);
export const DELETE = withApi<ItemParams>(recruiters.remove);
