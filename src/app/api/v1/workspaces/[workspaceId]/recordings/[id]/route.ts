import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { recordings } from "@/server/recordings/recordings";

export const GET = withApi<ItemParams>(recordings.get);
export const PATCH = withApi<ItemParams>(recordings.update);
export const DELETE = withApi<ItemParams>(recordings.remove);
