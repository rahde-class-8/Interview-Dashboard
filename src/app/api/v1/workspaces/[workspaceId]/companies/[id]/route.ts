import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { companies } from "@/server/recruitment/companies";

export const GET = withApi<ItemParams>(companies.get);
export const PATCH = withApi<ItemParams>(companies.update);
export const DELETE = withApi<ItemParams>(companies.remove);
