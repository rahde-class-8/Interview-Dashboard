"use client";

import type { WorkspaceRole } from "@/types";
import { useAppStore } from "./app-store";

const RANK: Record<WorkspaceRole, number> = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

/**
 * What the signed-in user may do in the active workspace. Used only to adapt
 * the interface; the API and database enforce the same rules independently.
 */
export function usePermissions() {
  const { data } = useAppStore();
  const role = data.workspace.role;
  return {
    role,
    canEdit: RANK[role] >= RANK.editor,
    canComment: RANK[role] >= RANK.commenter,
    /** Recording playback is limited to owners and editors (D4). */
    canPlayRecordings: RANK[role] >= RANK.editor,
    isOwner: role === "owner",
  };
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};
