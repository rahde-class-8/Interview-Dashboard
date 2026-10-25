import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { notes } from "@/server/collaboration/notes";

export const GET = withApi<WorkspaceParams>(notes.list);
export const POST = withApi<WorkspaceParams>(notes.create);
