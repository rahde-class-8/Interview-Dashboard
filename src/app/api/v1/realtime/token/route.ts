import { realtime } from "@/server/collaboration/realtime";
import { withApi } from "@/server/core/api";

export const GET = withApi(realtime.token);
