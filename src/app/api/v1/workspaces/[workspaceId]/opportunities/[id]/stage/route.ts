import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { opportunities } from "@/server/recruitment/opportunities";

export const PUT = withApi<ItemParams>(opportunities.setStage);
