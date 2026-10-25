import type { CollaboratorRole } from "@/types";

export const ROLE_OPTIONS: { value: CollaboratorRole; label: string; description: string }[] = [
  { value: "viewer", label: "Viewer", description: "Can read everything in the workspace." },
  { value: "commenter", label: "Commenter", description: "Can read and comment on shared notes." },
  { value: "editor", label: "Editor", description: "Can add and edit records, notes and recordings, and play recordings." },
];
