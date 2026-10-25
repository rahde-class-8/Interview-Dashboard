import "server-only";

import type { NextRequest } from "next/server";

import { commentCreateSchema, commentListQuerySchema, commentUpdateSchema, workspaceCommentListQuerySchema, type Comment } from "@/shared/contracts/collaboration";
import type { Page } from "@/shared/contracts/common";
import { check, checkMaybe, json, noContent, parseId, readBody, readQuery, requireWorkspace, type ApiContext } from "../core/api";
import type { ItemParams, WorkspaceParams } from "../core/crud";
import { ApiError, forbidden, notFound } from "../core/errors";
import { decodeCursor, pageRange, toPage } from "../core/pagination";
import type { Row } from "../core/rows";
import { toPerson } from "./people";

type CommentRow = Row<"comments"> & { author: { id: string; display_name: string } | null };

const SELECT = "*, author:profiles!comments_author_id_fkey(id, display_name)";

export function toComment(row: CommentRow): Comment {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    noteId: row.note_id,
    author: toPerson(row.author),
    body: deleted ? null : row.body,
    deleted,
    editedAt: row.edited_at,
    createdAt: row.created_at,
  };
}

async function assertNote(ctx: ApiContext<ItemParams>, noteId: string) {
  const note = checkMaybe(
    await ctx.supabase.from("shared_notes").select("id").eq("id", noteId).eq("workspace_id", ctx.params.workspaceId).maybeSingle(),
    "Note",
  );
  if (!note) throw notFound("Note");
}

async function loadComment(ctx: ApiContext<ItemParams>): Promise<CommentRow> {
  const id = parseId(ctx.params.id, "Comment");
  const row = checkMaybe(
    await ctx.supabase.from("comments").select(SELECT).eq("id", id).eq("workspace_id", ctx.params.workspaceId).maybeSingle(),
    "Comment",
  ) as CommentRow | null;
  if (!row) throw notFound("Comment");
  return row;
}

export const comments = {
  /** GET /notes/{id}/comments — any member; oldest first (thread order). */
  async listForNote(request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    const noteId = parseId(ctx.params.id, "Note");
    await assertNote(ctx, noteId);
    const params = readQuery(request, commentListQuerySchema);
    const offset = decodeCursor(params.cursor);
    const rows = check(
      await ctx.supabase
        .from("comments")
        .select(SELECT)
        .eq("workspace_id", ctx.params.workspaceId)
        .eq("note_id", noteId)
        .order("created_at")
        .order("id")
        .range(...pageRange(params.limit, offset)),
      "Comment",
    ) as CommentRow[];
    return json<Page<Comment>>(toPage(rows, params.limit, offset, toComment));
  },

  /** GET /comments?noteId= — any member; all comment threads, oldest first. */
  async listForWorkspace(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    const params = readQuery(request, workspaceCommentListQuerySchema);
    const offset = decodeCursor(params.cursor);
    let query = ctx.supabase.from("comments").select(SELECT).eq("workspace_id", ctx.params.workspaceId);
    if (params.noteId) query = query.eq("note_id", params.noteId);
    const rows = check(
      await query.order("created_at").order("id").range(...pageRange(params.limit, offset)),
      "Comment",
    ) as CommentRow[];
    return json<Page<Comment>>(toPage(rows, params.limit, offset, toComment));
  },

  /** POST /notes/{id}/comments — commenter+. */
  async create(request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "commenter");
    const noteId = parseId(ctx.params.id, "Note");
    const input = await readBody(request, commentCreateSchema);
    await assertNote(ctx, noteId);
    const row = check(
      await ctx.supabase
        .from("comments")
        .insert({ workspace_id: ctx.params.workspaceId, note_id: noteId, author_id: ctx.userId, body: input.body })
        .select(SELECT)
        .single(),
      "Comment",
    ) as CommentRow;
    return json(toComment(row), 201);
  },

  /** PATCH /comments/{id} — the author (commenter+). */
  async update(request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "commenter");
    const input = await readBody(request, commentUpdateSchema);
    const existing = await loadComment(ctx);
    if (existing.author_id !== ctx.userId) throw forbidden("Only the author can edit a comment.");
    if (existing.deleted_at) throw new ApiError(409, "conflict", "This comment was deleted.");
    const row = check(
      await ctx.supabase.from("comments").update({ body: input.body }).eq("id", existing.id).select(SELECT).single(),
      "Comment",
    ) as CommentRow;
    return json(toComment(row));
  },

  /** DELETE /comments/{id} — the author, or the workspace owner (moderation). Soft delete. */
  async remove(_request: NextRequest, ctx: ApiContext<ItemParams>) {
    const role = await requireWorkspace(ctx, ctx.params.workspaceId, "commenter");
    const existing = await loadComment(ctx);
    if (existing.author_id !== ctx.userId && role !== "owner") {
      throw forbidden("Only the author or the workspace owner can delete a comment.");
    }
    if (existing.deleted_at) return noContent();
    check(
      await ctx.supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", existing.id).select("id").single(),
      "Comment",
    );
    return noContent();
  },
};
