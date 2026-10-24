import "server-only";

import type { NextRequest } from "next/server";

import type { Role } from "@/shared/contracts/common";
import {
  profileUpdateSchema,
  workspaceCreateSchema,
  workspaceDeleteSchema,
  workspaceUpdateSchema,
  type Me,
  type Workspace,
} from "@/shared/contracts/workspaces";
import { check, checkMaybe, checkOk, json, noContent, readBody, requireWorkspace, type ApiContext } from "../core/api";
import { pickDefined, type WorkspaceParams } from "../core/crud";
import { ApiError, notFound } from "../core/errors";
import type { Database } from "../core/database.types";
import type { Row } from "../core/rows";

export function toWorkspace(row: Row<"workspaces">, role: Role): Workspace {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    role,
    recordingRetentionDays: row.recording_retention_days as Workspace["recordingRetentionDays"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function fetchWorkspace(ctx: ApiContext<WorkspaceParams>, role: Role) {
  const row = checkMaybe(
    await ctx.supabase.from("workspaces").select("*").eq("id", ctx.params.workspaceId).maybeSingle(),
    "Workspace",
  );
  if (!row) throw notFound("Workspace");
  return toWorkspace(row, role);
}

export const workspaces = {
  /** GET /workspaces — every workspace the caller belongs to, with their role. */
  async list(_request: NextRequest, ctx: ApiContext<Record<string, never>>) {
    const rows = check(
      await ctx.supabase
        .from("workspace_members")
        .select("role, workspace:workspaces!inner(*)")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: true }),
      "Workspace",
    ) as unknown as { role: Role; workspace: Row<"workspaces"> }[];
    return json({ data: rows.map((r) => toWorkspace(r.workspace, r.role)), nextCursor: null });
  },

  async create(request: NextRequest, ctx: ApiContext<Record<string, never>>) {
    const input = await readBody(request, workspaceCreateSchema);
    // INSERT … RETURNING would be checked against the SELECT policy before the owner
    // membership (added by an AFTER trigger) is visible, so insert with a server-chosen
    // id and read the row back afterwards.
    const id = crypto.randomUUID();
    checkOk(await ctx.supabase.from("workspaces").insert({ id, name: input.name, owner_id: ctx.userId }), "Workspace");
    const row = check(await ctx.supabase.from("workspaces").select("*").eq("id", id).single(), "Workspace");
    return json(toWorkspace(row, "owner"), 201);
  },

  async get(_request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    const role = await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    return json(await fetchWorkspace(ctx, role));
  },

  async update(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "owner");
    const input = await readBody(request, workspaceUpdateSchema);
    checkOk(
      await ctx.supabase
        .from("workspaces")
        .update(
          pickDefined(input, { name: "name", recordingRetentionDays: "recording_retention_days" }) as Database["public"]["Tables"]["workspaces"]["Update"],
        )
        .eq("id", ctx.params.workspaceId),
      "Workspace",
    );
    return json(await fetchWorkspace(ctx, "owner"));
  },

  /** DELETE /workspaces/{id} with body {"confirmName": "<exact workspace name>"}. */
  async remove(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "owner");
    const { confirmName } = await readBody(request, workspaceDeleteSchema);
    const workspace = await fetchWorkspace(ctx, "owner");
    if (confirmName !== workspace.name) {
      throw new ApiError(400, "validation_failed", "Type the workspace name exactly to confirm deletion.", [
        { path: "confirmName", message: "Does not match the workspace name." },
      ]);
    }
    checkOk(await ctx.supabase.from("workspaces").delete().eq("id", ctx.params.workspaceId), "Workspace");
    return noContent();
  },
};

function toMe(row: Row<"profiles">): Me {
  return { id: row.id, email: row.email, displayName: row.display_name, headline: row.headline };
}

export const me = {
  async get(_request: NextRequest, ctx: ApiContext<Record<string, never>>) {
    const row = check(await ctx.supabase.from("profiles").select("*").eq("id", ctx.userId).single(), "Profile");
    return json(toMe(row));
  },

  async update(request: NextRequest, ctx: ApiContext<Record<string, never>>) {
    const input = await readBody(request, profileUpdateSchema);
    const row = check(
      await ctx.supabase
        .from("profiles")
        .update(pickDefined(input, { displayName: "display_name", headline: "headline" }) as Database["public"]["Tables"]["profiles"]["Update"])
        .eq("id", ctx.userId)
        .select("*")
        .single(),
      "Profile",
    );
    return json(toMe(row));
  },
};
