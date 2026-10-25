import { withApi } from "@/server/core/api";
import type { ItemParams } from "@/server/core/crud";
import { invitations } from "@/server/collaboration/invitations";

export const DELETE = withApi<ItemParams>(invitations.revoke);
