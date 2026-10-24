import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { starStories } from "@/server/preparation/star-stories";

export const GET = withApi<WorkspaceParams>(starStories.list);
export const POST = withApi<WorkspaceParams>(starStories.create);
