import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { starStories } from "@/server/preparation/star-stories";

export const GET = withApi<ItemParams>(starStories.get);
export const PATCH = withApi<ItemParams>(starStories.update);
export const DELETE = withApi<ItemParams>(starStories.remove);
