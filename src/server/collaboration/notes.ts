import "server-only";

import type { NextRequest } from "next/server";

import {
  noteCreateSchema,
  noteListQuerySchema,
  noteUpdateSchema,
  type SharedNote,
  type SharedNoteSummary,
} from "@/shared/contracts/collaboration";
import type { Page } from "@/shared/contracts/common";
import { check, checkMaybe, json, noContent, parseId, readBody, readQuery, requireWorkspace, type ApiContext } from "../core/api";
import { pickDefined, type ItemParams, type WorkspaceParams } from "../core/crud";
import { ApiError, notFound } from "../core/errors";
import { decodeCursor, pageRange, toPage } from "../core/pagination";
import type { Database } from "../core/database.types";
import type { Row } from "../core/rows";
import { toPerson } from "./people";

type NoteUpdate = Database["public"]["Tables"]["shared_notes"]["Update"];
type NoteRow = Row<"shared_notes"> & { updater: { id: string; display_name: string } | null };

const EDITOR = "updater:profiles!shared_notes_updated_by_fkey(id, display_name)";
const DETAIL_SELECT = `*, ${EDITOR}`;
const SUMMARY_SELECT = `id, workspace_id, opportunity_id, title, version, created_by, updated_by, created_at, updated_at, ${EDITOR}`;

function toSummary(row: Omit<NoteRow, "body">): SharedNoteSummary {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    opportunityId: row.opportunity_id,
    title: row.title,
    version: row.version,
    createdBy: row.created_by,
    updatedBy: toPerson(row.updater),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toNote(row: NoteRow): SharedNote {
  return { ...toSummary(row), body: row.body };
}

async function fetchNote(ctx: ApiContext<ItemParams>, id: string): Promise<NoteRow | null> {
  return checkMaybe(
    await ctx.supabase.from("shared_notes").select(DETAIL_SELECT).eq("id", id).eq("workspace_id", ctx.params.workspaceId).maybeSingle(),
    "Note",
  ) as NoteRow | null;
}

/**
 * Shared notes use optimistic concurrency: every update must send the version it
 * was based on, and a stale version is rejected with 409 and the current note.
 * This prevents silent overwrites; it is not simultaneous (character-level) editing.
 */
export const notes = {
  async list(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    const params = readQuery(request, noteListQuerySchema);
    const offset = decodeCursor(params.cursor);
    const detail = params.view === "detail";
    let query = ctx.supabase.from("shared_notes").select(detail ? DETAIL_SELECT : SUMMARY_SELECT).eq("workspace_id", ctx.params.workspaceId);
    if (params.opportunityId) query = query.eq("opportunity_id", params.opportunityId);
    const rows = check(
      await query.order("updated_at", { ascending: false }).order("id").range(...pageRange(params.limit, offset)),
      "Note",
    ) as unknown as NoteRow[];
    return json<Page<SharedNoteSummary | SharedNote>>(toPage(rows, params.limit, offset, detail ? toNote : toSummary));
  },

  async create(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const input = await readBody(request, noteCreateSchema);
    const row = check(
      await ctx.supabase
        .from("shared_notes")
        .insert({
          workspace_id: ctx.params.workspaceId,
          title: input.title,
          body: input.body,
          opportunity_id: input.opportunityId ?? null,
        })
        .select(DETAIL_SELECT)
        .single(),
      "Note",
    ) as NoteRow;
    return json(toNote(row), 201);
  },

  async get(_request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    const row = await fetchNote(ctx, parseId(ctx.params.id, "Note"));
    if (!row) throw notFound("Note");
    return json(toNote(row));
  },

  async update(request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const id = parseId(ctx.params.id, "Note");
    const input = await readBody(request, noteUpdateSchema);
    const row = checkMaybe(
      await ctx.supabase
        .from("shared_notes")
        .update(pickDefined(input, { title: "title", body: "body", opportunityId: "opportunity_id" }) as NoteUpdate)
        .eq("id", id)
        .eq("workspace_id", ctx.params.workspaceId)
        .eq("version", input.version)
        .select(DETAIL_SELECT)
        .maybeSingle(),
      "Note",
    ) as NoteRow | null;
    if (row) return json(toNote(row));

    const current = await fetchNote(ctx, id);
    if (!current) throw notFound("Note");
    const error = new ApiError(409, "conflict", "This note was changed by someone else. Review the latest version and apply your changes again.");
    return json({ error: { code: error.code, message: error.message, requestId: ctx.requestId }, current: toNote(current) }, 409);
  },

  async remove(_request: NextRequest, ctx: ApiContext<ItemParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const id = parseId(ctx.params.id, "Note");
    const rows = check(
      await ctx.supabase.from("shared_notes").delete().eq("id", id).eq("workspace_id", ctx.params.workspaceId).select("id"),
      "Note",
    );
    if (rows.length === 0) throw notFound("Note");
    return noContent();
  },
};
