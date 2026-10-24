import "server-only";

import type { NextRequest } from "next/server";
import type { z } from "zod";

import type { Page, Role } from "@/shared/contracts/common";
import { check, checkMaybe, json, noContent, parseId, readBody, readQuery, requireWorkspace, type ApiContext } from "./api";
import type { Database } from "./database.types";
import { notFound } from "./errors";
import { decodeCursor, pageRange, toPage } from "./pagination";

type TableName = keyof Database["public"]["Tables"];

/** Minimal query-builder surface used by list filters (kept loose on purpose). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Query = any;

export interface WorkspaceParams {
  workspaceId: string;
  [key: string]: string;
}
export interface ItemParams extends WorkspaceParams {
  id: string;
}

/** Values computed by resolveList and passed to applyList. */
export type ListContext = Record<string, string[] | undefined>;

export interface CrudConfig<Row, Dto, ListQuery, CreateIn, UpdateIn> {
  table: TableName;
  /** Human-readable name used in error messages, e.g. "Company". */
  resource: string;
  /** PostgREST select list (defaults to "*"). */
  select?: string;
  toDto: (row: Row) => Dto;
  listQuery: z.ZodType<ListQuery & { limit: number; cursor?: string }>;
  /**
   * Optional async preparation for list filters (e.g. resolving search terms to ids).
   * Kept separate because query builders are thenables: returning one from an async
   * function would execute it prematurely.
   */
  resolveList?: (params: ListQuery, ctx: ApiContext<WorkspaceParams>) => Promise<ListContext>;
  /** Applies filters and ordering for list requests (synchronous). */
  applyList: (query: Query, params: ListQuery, resolved: ListContext) => Query;
  createSchema: z.ZodType<CreateIn>;
  toInsert: (input: CreateIn, ctx: ApiContext<WorkspaceParams>) => Record<string, unknown>;
  updateSchema: z.ZodType<UpdateIn>;
  toUpdate: (input: UpdateIn) => Record<string, unknown>;
  /** Role required to create/update/delete (default editor). */
  writeRole?: Role;
}

/**
 * Standard workspace-scoped CRUD handlers: list (paginated), create, get,
 * update (partial) and delete. Every query is additionally filtered by
 * workspace_id; RLS enforces membership and roles regardless.
 */
export function crud<Row, Dto, ListQuery, CreateIn, UpdateIn>(config: CrudConfig<Row, Dto, ListQuery, CreateIn, UpdateIn>) {
  const select = config.select ?? "*";
  const writeRole = config.writeRole ?? "editor";
  const from = (ctx: ApiContext<WorkspaceParams>) => (ctx.supabase as Query).from(config.table);

  async function fetchOne(ctx: ApiContext<WorkspaceParams>, id: string): Promise<Dto> {
    const row = checkMaybe(
      await from(ctx).select(select).eq("id", id).eq("workspace_id", ctx.params.workspaceId).maybeSingle(),
      config.resource,
    ) as Row | null;
    if (!row) throw notFound(config.resource);
    return config.toDto(row);
  }

  return {
    fetchOne,

    async list(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
      await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
      const params = readQuery(request, config.listQuery);
      const offset = decodeCursor(params.cursor);
      const resolved = config.resolveList ? await config.resolveList(params, ctx) : {};
      const query = config.applyList(from(ctx).select(select).eq("workspace_id", ctx.params.workspaceId), params, resolved);
      const rows = check(await query.range(...pageRange(params.limit, offset)), config.resource) as Row[];
      return json<Page<Dto>>(toPage(rows, params.limit, offset, config.toDto));
    },

    async create(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
      await requireWorkspace(ctx, ctx.params.workspaceId, writeRole);
      const input = await readBody(request, config.createSchema);
      const row = check(
        await from(ctx)
          .insert({ ...config.toInsert(input, ctx), workspace_id: ctx.params.workspaceId })
          .select(select)
          .single(),
        config.resource,
      ) as Row;
      return json(config.toDto(row), 201);
    },

    async get(_request: NextRequest, ctx: ApiContext<ItemParams>) {
      await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
      return json(await fetchOne(ctx, parseId(ctx.params.id, config.resource)));
    },

    async update(request: NextRequest, ctx: ApiContext<ItemParams>) {
      await requireWorkspace(ctx, ctx.params.workspaceId, writeRole);
      const id = parseId(ctx.params.id, config.resource);
      const input = await readBody(request, config.updateSchema);
      const row = checkMaybe(
        await from(ctx)
          .update(config.toUpdate(input))
          .eq("id", id)
          .eq("workspace_id", ctx.params.workspaceId)
          .select(select)
          .maybeSingle(),
        config.resource,
      ) as Row | null;
      if (!row) throw notFound(config.resource);
      return json(config.toDto(row));
    },

    async remove(_request: NextRequest, ctx: ApiContext<ItemParams>) {
      await requireWorkspace(ctx, ctx.params.workspaceId, writeRole);
      const id = parseId(ctx.params.id, config.resource);
      const rows = check(
        await from(ctx).delete().eq("id", id).eq("workspace_id", ctx.params.workspaceId).select("id"),
        config.resource,
      ) as { id: string }[];
      if (rows.length === 0) throw notFound(config.resource);
      return noContent();
    },
  };
}

/** Copies only the defined keys of `input`, renaming them to column names. */
export function pickDefined(input: Record<string, unknown>, columns: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(columns)) {
    if (input[key] !== undefined) out[column] = input[key];
  }
  return out;
}
