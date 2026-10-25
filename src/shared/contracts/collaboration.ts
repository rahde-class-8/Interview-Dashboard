import { z } from "zod";

import { pageQuerySchema, requiredText, uuidSchema, type Role } from "./common";

/** Roles that can be granted to collaborators (ownership is not assignable). */
export const collaboratorRoleSchema = z.enum(["editor", "commenter", "viewer"]);
export type CollaboratorRole = z.infer<typeof collaboratorRoleSchema>;

// --- Members ---------------------------------------------------------------------

export const memberUpdateSchema = z.object({ role: collaboratorRoleSchema });

export interface Member {
  userId: string;
  displayName: string;
  email: string;
  role: Role;
  joinedAt: string;
  isYou: boolean;
}

// --- Invitations -----------------------------------------------------------------

export const invitationCreateSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a valid email address." })).pipe(z.string().max(320)),
  role: collaboratorRoleSchema,
});

export const invitationListQuerySchema = pageQuerySchema.extend({
  status: z.enum(["pending", "all"]).default("pending"),
});

/** Invitation tokens are sent in request bodies (never in API URLs) to keep them out of logs. */
export const invitationTokenSchema = z.object({ token: z.string().trim().min(32).max(256) });

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export interface Invitation {
  id: string;
  workspaceId: string;
  email: string;
  role: CollaboratorRole;
  /** Pending invitations past expiresAt are reported as "expired". */
  status: InvitationStatus;
  invitedBy: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface InvitationCreated {
  invitation: Invitation;
  /** Shown once; the server stores only a hash of the token. */
  inviteUrl: string;
  token: string;
}

export interface InvitationPreview {
  workspaceName: string;
  role: CollaboratorRole;
  invitedByName: string | null;
  expiresAt: string;
  /** False when the signed-in account's email differs from the invited address. */
  emailMatches: boolean;
}

export interface InvitationAccepted {
  workspaceId: string;
  role: Role;
}

// --- Shared notes ------------------------------------------------------------------

export const noteCreateSchema = z.object({
  title: requiredText(200, "Title"),
  body: z.string().max(100_000, "Notes can be at most 100,000 characters.").default(""),
  opportunityId: uuidSchema.nullable().optional(),
});

export const noteUpdateSchema = z
  .object({
    title: requiredText(200, "Title").optional(),
    body: z.string().max(100_000, "Notes can be at most 100,000 characters.").optional(),
    opportunityId: uuidSchema.nullable().optional(),
    /** The version the client edited; if the server has a newer one → 409 conflict. */
    version: z.number().int().min(1),
  })
  .refine((v) => v.title !== undefined || v.body !== undefined || v.opportunityId !== undefined, {
    message: "Provide at least one field to update.",
  });

export const noteListQuerySchema = pageQuerySchema.extend({
  opportunityId: uuidSchema.optional(),
});

export interface PersonRef {
  id: string;
  displayName: string;
}

export interface SharedNote {
  id: string;
  workspaceId: string;
  opportunityId: string | null;
  title: string;
  body: string;
  version: number;
  createdBy: string | null;
  /** Null when the last editor's account was deleted or left the workspace. */
  updatedBy: PersonRef | null;
  createdAt: string;
  updatedAt: string;
}

export type SharedNoteSummary = Omit<SharedNote, "body">;

// --- Comments ----------------------------------------------------------------------

export const commentCreateSchema = z.object({ body: requiredText(5000, "Comment") });
export const commentUpdateSchema = commentCreateSchema;
export const commentListQuerySchema = pageQuerySchema;

export interface Comment {
  id: string;
  workspaceId: string;
  noteId: string;
  author: PersonRef | null;
  /** Null for deleted comments, which stay in the thread as placeholders. */
  body: string | null;
  deleted: boolean;
  editedAt: string | null;
  createdAt: string;
}

// --- Activity ----------------------------------------------------------------------

export const activityListQuerySchema = pageQuerySchema.extend({
  entityType: z
    .enum(["opportunity", "recruiter_call", "interview", "preparation_task", "follow_up", "recording", "shared_note", "comment", "member", "invitation", "workspace"])
    .optional(),
  entityId: uuidSchema.optional(),
});

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  actor: PersonRef | null;
  /** e.g. "opportunity.stage_changed" */
  action: string;
  entityType: string;
  entityId: string | null;
  /** Display labels only (titles, names, roles, stages). */
  metadata: Record<string, string | number | null>;
  /** Human-readable sentence, e.g. "Alex moved “SRE” from Applied to Interviewing". */
  summary: string;
  createdAt: string;
}

// --- Realtime ------------------------------------------------------------------------

export interface RealtimeToken {
  /** The user's short-lived access token, for supabase.realtime.setAuth(). */
  accessToken: string;
  expiresAt: string;
}

/** Payload of a "change" broadcast on the private topic `workspace:<id>`. */
export interface RealtimeChange {
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  recordId: string;
  workspaceId: string;
}

export const workspaceTopic = (workspaceId: string) => `workspace:${workspaceId}`;
