import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { comments } from "@/server/collaboration/comments";

export const PATCH = withApi<ItemParams>(comments.update);
export const DELETE = withApi<ItemParams>(comments.remove);
