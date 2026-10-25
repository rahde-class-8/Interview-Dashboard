import { withApi } from "@/server/core/api";
import type { WorkspaceParams } from "@/server/core/crud";
import { recordings } from "@/server/recordings/recordings";

export const GET = withApi<WorkspaceParams>(recordings.listForWorkspace);
