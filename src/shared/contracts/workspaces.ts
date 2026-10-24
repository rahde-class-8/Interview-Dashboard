import { z } from "zod";

import { nonEmptyPatch, requiredText, type Role } from "./common";

export const workspaceCreateSchema = z.object({ name: requiredText(120, "Name") });

export const workspaceUpdateSchema = nonEmptyPatch(
  z.object({
    name: requiredText(120, "Name").optional(),
    recordingRetentionDays: z.union([z.literal(30), z.literal(90), z.literal(180), z.literal(365)]).nullable().optional(),
  }),
);

export const workspaceDeleteSchema = z.object({ confirmName: z.string() });

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  role: Role;
  recordingRetentionDays: 30 | 90 | 180 | 365 | null;
  createdAt: string;
  updatedAt: string;
}

export const profileUpdateSchema = nonEmptyPatch(
  z.object({
    displayName: requiredText(120, "Name").optional(),
    headline: z.string().trim().max(200).nullable().optional(),
  }),
);

export interface Me {
  id: string;
  email: string;
  displayName: string;
  headline: string | null;
}
