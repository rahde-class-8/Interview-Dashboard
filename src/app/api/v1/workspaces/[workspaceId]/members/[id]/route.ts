import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { members } from "@/server/collaboration/members";

export const PATCH = withApi<ItemParams>(members.update);
export const DELETE = withApi<ItemParams>(members.remove);
