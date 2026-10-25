import "server-only";

import type { NextRequest } from "next/server";

import { memberUpdateSchema, type Member } from "@/shared/contracts/collaboration";
import type { Role } from "@/shared/contracts/common";
import { check, checkMaybe, json, noContent, parseId, readBody, requireWorkspace, type ApiContext } from "../core/api";
import type { ItemParams, WorkspaceParams } from "../core/crud";
import { ApiError, forbidden, notFound } from "../core/errors";

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string;
  profile: { display_name: string; email: string } | null;
};

const SELECT = "user_id, role, created_at, profile:profiles!workspace_members_user_id_fkey(display_name, email)";

function toMember(row: MemberRow, userId: string): Member {
  return {
    userId: row.user_id,
    displayName: row.profile?.display_name ?? "",
    email: row.profile?.email ?? "",
    role: row.role as Role,
    joinedAt: row.created_at,
    isYou: row.user_id === userId,
  };
}

async function loadMember(ctx: ApiContext<ItemParams>, userId: string): Promise<MemberRow> {
  const row = checkMaybe(
    await ctx.supabase.from("workspace_members").select(SELECT).eq("workspace_id", ctx.params.workspaceId).eq("user_id", userId).maybeSingle(),
    "Member",
  ) as MemberRow | null;
  if (!row) throw notFound("Member");
  return row;
}

export const members = {
  /** GET /workspaces/{id}/members — any member. Owner first, then by join date. */
  async list(_request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    const rows = check(
      await ctx.supabase.from("workspace_members").select(SELECT).eq("workspace_id", ctx.params.workspaceId).order("created_at").limit(500),
      "Member",
    ) as MemberRow[];
    const list = rows.map((row) => toMember(row, ctx.userId));
    list.sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
    return json({ data: list });
  },

  /** PATCH /workspaces/{id}/members/{userId} — owner; editor/commenter/viewer only. */
  async update(request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "owner");
    const userId = parseId(ctx.params.id, "Member");
    const input = await readBody(request, memberUpdateSchema);
    const target = await loadMember(ctx, userId);
    if (target.role === "owner") throw new ApiError(409, "conflict", "The owner's role cannot be changed.");
    check(
      await ctx.supabase
        .from("workspace_members")
        .update({ role: input.role })
        .eq("workspace_id", ctx.params.workspaceId)
        .eq("user_id", userId)
        .select("user_id")
        .single(),
      "Member",
    );
    return json(toMember(await loadMember(ctx, userId), ctx.userId));
  },

  /**
   * DELETE /workspaces/{id}/members/{userId} — the owner removes a member, or a
   * member leaves (their own id). The owner cannot leave or be removed.
   */
  async remove(_request: NextRequest, ctx: ApiContext<ItemParams>) {
    const role = await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    const userId = parseId(ctx.params.id, "Member");
    const self = userId === ctx.userId;
    if (!self && role !== "owner") throw forbidden("Only the workspace owner can remove members.");
    const target = await loadMember(ctx, userId);
    if (target.role === "owner") {
      throw new ApiError(409, "conflict", self ? "The owner cannot leave the workspace." : "The owner cannot be removed.");
    }
    const rows = check(
      await ctx.supabase.from("workspace_members").delete().eq("workspace_id", ctx.params.workspaceId).eq("user_id", userId).select("user_id"),
      "Member",
    );
    if (rows.length === 0) throw notFound("Member");
    return noContent();
  },
};
