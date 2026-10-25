import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { notes } from "@/server/collaboration/notes";

export const GET = withApi<ItemParams>(notes.get);
export const PATCH = withApi<ItemParams>(notes.update);
export const DELETE = withApi<ItemParams>(notes.remove);
