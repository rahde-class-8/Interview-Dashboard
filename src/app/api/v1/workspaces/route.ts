import { withApi } from "@/server/core/api";
import { workspaces } from "@/server/workspaces/workspaces";

export const GET = withApi(workspaces.list);
export const POST = withApi(workspaces.create);
