import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";

import {
  invitationCreateSchema,
  invitationListQuerySchema,
  invitationTokenSchema,
  type CollaboratorRole,
  type Invitation,
  type InvitationAccepted,
  type InvitationCreated,
  type InvitationPreview,
  type InvitationStatus,
} from "@/shared/contracts/collaboration";
import type { Page, Role } from "@/shared/contracts/common";
import { check, checkMaybe, json, noContent, parseId, readBody, readQuery, requireWorkspace, type ApiContext } from "../core/api";
import type { ItemParams, WorkspaceParams } from "../core/crud";
import { ApiError, forbidden, fromDatabaseError, notFound } from "../core/errors";
import { decodeCursor, pageRange, toPage } from "../core/pagination";
import { enforceRateLimit } from "../core/rate-limit";

// token_hash is never selected (clients have no SELECT privilege on it).
const SELECT = "id, workspace_id, email, role, status, invited_by, expires_at, accepted_at, created_at";

type InvitationRow = {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  status: string;
  invited_by: string | null;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
};

const INVITES_PER_HOUR = 20;
const TOKEN_ATTEMPTS_PER_HOUR = 60;

export function effectiveStatus(row: Pick<InvitationRow, "status" | "expires_at">, now = Date.now()): InvitationStatus {
  if (row.status === "pending" && new Date(row.expires_at).getTime() <= now) return "expired";
  return row.status as InvitationStatus;
}

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    role: row.role as CollaboratorRole,
    status: effectiveStatus(row),
    invitedBy: row.invited_by,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    createdAt: row.created_at,
  };
}

/** 256-bit random token; only its SHA-256 is stored. */
export function newInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hashHex: createHash("sha256").update(token).digest("hex") };
}

function appOrigin(request: NextRequest) {
  return (process.env.APP_URL ?? request.nextUrl.origin).replace(/\/$/, "");
}

const invalidInvitation = () => new ApiError(404, "not_found", "This invitation is invalid or no longer available.");

export const invitations = {
  /** GET /workspaces/{id}/invitations — owner. */
  async list(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "owner");
    const params = readQuery(request, invitationListQuerySchema);
    const offset = decodeCursor(params.cursor);
    let query = ctx.supabase.from("workspace_invitations").select(SELECT).eq("workspace_id", ctx.params.workspaceId);
    if (params.status === "pending") query = query.eq("status", "pending").gt("expires_at", new Date().toISOString());
    const rows = check(
      await query.order("created_at", { ascending: false }).order("id").range(...pageRange(params.limit, offset)),
      "Invitation",
    ) as InvitationRow[];
    return json<Page<Invitation>>(toPage(rows, params.limit, offset, toInvitation));
  },

  /**
   * POST /workspaces/{id}/invitations — owner. Returns the invite link once.
   * No email is sent yet (provider decision D9 is open): the owner shares the link.
   */
  async create(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "owner");
    const input = await readBody(request, invitationCreateSchema);
    await enforceRateLimit(ctx.userId, "invitation_create", INVITES_PER_HOUR);

    const { token, hashHex } = newInvitationToken();
    const { data, error } = await ctx.supabase
      .from("workspace_invitations")
      .insert({
        workspace_id: ctx.params.workspaceId,
        email: input.email,
        role: input.role,
        token_hash: `\\x${hashHex}`,
        invited_by: ctx.userId,
      })
      .select(SELECT)
      .single();
    if (error) {
      if (error.hint === "already_member" || error.hint === "already_invited" || error.hint === "invitation_limit") {
        throw new ApiError(409, "conflict", error.message);
      }
      throw fromDatabaseError(error, "Invitation");
    }
    return json<InvitationCreated>(
      { invitation: toInvitation(data as InvitationRow), inviteUrl: `${appOrigin(request)}/invite/${token}`, token },
      201,
    );
  },

  /** DELETE /workspaces/{id}/invitations/{invitationId} — owner; revokes a pending invitation. */
  async revoke(_request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "owner");
    const id = parseId(ctx.params.id, "Invitation");
    const existing = checkMaybe(
      await ctx.supabase.from("workspace_invitations").select(SELECT).eq("id", id).eq("workspace_id", ctx.params.workspaceId).maybeSingle(),
      "Invitation",
    ) as InvitationRow | null;
    if (!existing) throw notFound("Invitation");
    if (effectiveStatus(existing) !== "pending") throw new ApiError(409, "conflict", "Only pending invitations can be revoked.");
    check(
      await ctx.supabase.from("workspace_invitations").update({ status: "revoked" }).eq("id", id).select("id").single(),
      "Invitation",
    );
    return noContent();
  },

  /** POST /invitations/preview {token} — any signed-in user holding the link. */
  async preview(request: NextRequest, ctx: ApiContext<Record<string, never>>) {
    const { token } = await readBody(request, invitationTokenSchema).catch(() => {
      throw invalidInvitation();
    });
    await enforceRateLimit(ctx.userId, "invitation_token", TOKEN_ATTEMPTS_PER_HOUR);
    const { data, error } = await ctx.supabase.rpc("preview_invitation", { p_token: token });
    if (error) throw error.code === "P0002" ? invalidInvitation() : fromDatabaseError(error, "Invitation");
    const row = data?.[0];
    if (!row) throw invalidInvitation();
    return json<InvitationPreview>({
      workspaceName: row.workspace_name,
      role: row.role as CollaboratorRole,
      invitedByName: row.invited_by_name ?? null,
      expiresAt: row.expires_at,
      emailMatches: row.email_matches,
    });
  },

  /** POST /invitations/accept {token} — the invited account (email must match). */
  async accept(request: NextRequest, ctx: ApiContext<Record<string, never>>) {
    const { token } = await readBody(request, invitationTokenSchema).catch(() => {
      throw invalidInvitation();
    });
    await enforceRateLimit(ctx.userId, "invitation_token", TOKEN_ATTEMPTS_PER_HOUR);
    const { data, error } = await ctx.supabase.rpc("accept_invitation", { p_token: token });
    if (error) {
      if (error.code === "P0002") throw invalidInvitation();
      if (error.code === "42501") throw forbidden("This invitation was sent to a different email address. Sign in with that address to accept it.");
      throw fromDatabaseError(error, "Invitation");
    }
    const row = data?.[0];
    if (!row) throw invalidInvitation();
    return json<InvitationAccepted>({ workspaceId: row.workspace_id, role: row.role as Role });
  },
};
