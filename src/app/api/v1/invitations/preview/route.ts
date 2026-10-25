import { invitations } from "@/server/collaboration/invitations";
import { withApi } from "@/server/core/api";

export const POST = withApi(invitations.preview);
