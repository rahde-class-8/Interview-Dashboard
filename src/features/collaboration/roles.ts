import type { CollaboratorRole } from "@/types";

export const ROLE_OPTIONS: { value: CollaboratorRole; label: string; description: string }[] = [
  { value: "viewer", label: "Viewer", description: "Can read shared notes and records." },
  { value: "commenter", label: "Commenter", description: "Can read and leave comments." },
  { value: "editor", label: "Editor", description: "Can edit shared notes and records." },
];

export const ROLE_LABELS: Record<CollaboratorRole, string> = {
  viewer: "Viewer",
  commenter: "Commenter",
  editor: "Editor",
};
