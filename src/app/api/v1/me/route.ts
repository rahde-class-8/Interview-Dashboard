import { withApi } from "@/server/core/api";
import { me } from "@/server/workspaces/workspaces";

export const GET = withApi(me.get);
export const PATCH = withApi(me.update);
