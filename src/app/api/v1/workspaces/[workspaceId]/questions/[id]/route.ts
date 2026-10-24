import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { questions } from "@/server/preparation/questions";

export const GET = withApi<ItemParams>(questions.get);
export const PATCH = withApi<ItemParams>(questions.update);
export const DELETE = withApi<ItemParams>(questions.remove);
