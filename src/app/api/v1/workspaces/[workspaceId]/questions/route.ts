import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { questions } from "@/server/preparation/questions";

export const GET = withApi<WorkspaceParams>(questions.list);
export const POST = withApi<WorkspaceParams>(questions.create);
