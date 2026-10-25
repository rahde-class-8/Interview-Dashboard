import "server-only";

import type { NextRequest } from "next/server";

import { activityListQuerySchema, type ActivityEvent } from "@/shared/contracts/collaboration";
import type { Page } from "@/shared/contracts/common";
import { check, json, readQuery, requireWorkspace, type ApiContext } from "../core/api";
import type { WorkspaceParams } from "../core/crud";
import { decodeCursor, pageRange, toPage } from "../core/pagination";
import type { Row } from "../core/rows";
import { describeActivity } from "./activity-summary";
import { toPerson } from "./people";

type ActivityRow = Row<"activity_events"> & { actor: { id: string; display_name: string } | null };

export function toActivity(row: ActivityRow): ActivityEvent {
  const metadata = (row.metadata ?? {}) as ActivityEvent["metadata"];
  const actor = toPerson(row.actor);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actor,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata,
    summary: describeActivity(row.action, metadata, actor?.displayName ?? null),
    createdAt: row.created_at,
  };
}

export const activity = {
  /** GET /workspaces/{id}/activity — any member; newest first. */
  async list(request: NextRequest, ctx: ApiContext<WorkspaceParams>) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    const params = readQuery(request, activityListQuerySchema);
    const offset = decodeCursor(params.cursor);
    let query = ctx.supabase
      .from("activity_events")
      .select("*, actor:profiles!activity_events_actor_id_fkey(id, display_name)")
      .eq("workspace_id", ctx.params.workspaceId);
    if (params.entityType) query = query.eq("entity_type", params.entityType);
    if (params.entityId) query = query.eq("entity_id", params.entityId);
    const rows = check(
      await query.order("created_at", { ascending: false }).order("id").range(...pageRange(params.limit, offset)),
      "Activity",
    ) as ActivityRow[];
    return json<Page<ActivityEvent>>(toPage(rows, params.limit, offset, toActivity));
  },
};
