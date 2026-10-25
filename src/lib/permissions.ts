import type { WorkspaceRole } from "@/types";

const RANK: Record<WorkspaceRole, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

/** True when `role` is at least `minimum` (owner > editor > commenter > viewer). */
export function hasRole(role: WorkspaceRole, minimum: WorkspaceRole) {
  return RANK[role] >= RANK[minimum];
}

/**
 * What a role may do, mirroring the server rules (RLS + API) so the interface
 * only offers allowed actions. The server enforces these independently.
 */
export function permissionsFor(role: WorkspaceRole) {
  return {
    role,
    canEdit: hasRole(role, "editor"),
    canComment: hasRole(role, "commenter"),
    /** Recording playback is limited to owners and editors (D4). */
    canPlayRecordings: hasRole(role, "editor"),
    /** Members, invitations, workspace settings and deletion. */
    isOwner: role === "owner",
  };
}

export type Permissions = ReturnType<typeof permissionsFor>;

/** Owners delete any recording; editors only their own uploads. */
export function canDeleteRecording(role: WorkspaceRole, isUploader: boolean) {
  return role === "owner" || (hasRole(role, "editor") && isUploader);
}

/** Authors (commenter+) edit their comments; authors or owners delete them. */
export function commentPermissions(role: WorkspaceRole, isAuthor: boolean) {
  const author = isAuthor && hasRole(role, "commenter");
  return { canEdit: author, canDelete: author || role === "owner" };
}
