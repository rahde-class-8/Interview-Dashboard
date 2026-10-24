import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { recordings } from "@/server/recordings/recordings";

export const POST = withApi<ItemParams>(recordings.complete);
