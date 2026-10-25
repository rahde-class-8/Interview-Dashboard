"use client";

import { permissionsFor } from "@/lib/permissions";
import type { WorkspaceRole } from "@/types";
import { useAppStore } from "./app-store";

/**
 * What the signed-in user may do in the active workspace. Used only to adapt
 * the interface; the API and database enforce the same rules independently.
 */
export function usePermissions() {
  const { data } = useAppStore();
  return permissionsFor(data.workspace.role);
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
};
