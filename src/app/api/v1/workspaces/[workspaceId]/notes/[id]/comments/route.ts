import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { comments } from "@/server/collaboration/comments";

export const GET = withApi<ItemParams>(comments.listForNote);
export const POST = withApi<ItemParams>(comments.create);
