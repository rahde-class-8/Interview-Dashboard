import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { followUps } from "@/server/followups/follow-ups";

export const GET = withApi<ItemParams>(followUps.get);
export const PATCH = withApi<ItemParams>(followUps.update);
export const DELETE = withApi<ItemParams>(followUps.remove);
