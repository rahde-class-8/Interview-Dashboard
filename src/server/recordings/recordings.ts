import "server-only";

import type { NextRequest } from "next/server";
import { z } from "zod";

import type { Page } from "@/shared/contracts/common";
import {
  RECORDING_FORMATS,
  recordingCreateSchema,
  recordingExtension,
  recordingListQuerySchema,
  recordingUpdateSchema,
  type Recording,
  type RecordingMimeType,
  type RecordingPlayback,
  type RecordingStatus,
  type RecordingUploadResponse,
  type RecordingUploadTarget,
} from "@/shared/contracts/recordings";
import { check, checkMaybe, checkOk, json, noContent, parseId, readBody, readQuery, requireWorkspace, type ApiContext } from "../core/api";
import type { ItemParams } from "../core/crud";
import { ApiError, forbidden, fromDatabaseError, notFound } from "../core/errors";
import { decodeCursor, pageRange, toPage } from "../core/pagination";
import { enforceRateLimit } from "../core/rate-limit";
import type { Row } from "../core/rows";
import { getSupabaseAdmin } from "../core/supabase/admin";
import { RECORDING_RATE_LIMITS, maxRecordingBytes } from "./config";
import { SIGNATURE_BYTES, detectAudioFormat } from "./formats";
import {
  PLAYBACK_URL_TTL_SECONDS,
  RECORDINGS_BUCKET,
  StorageUnavailableError,
  UPLOAD_URL_TTL_SECONDS,
  getRecordingStorage,
} from "./storage";

type RecordingRow = Row<"recordings">;
type Ctx = ApiContext<ItemParams>;

const RESOURCE = "Recording";

export function toRecording(row: RecordingRow): Recording {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    callId: row.recruiter_call_id,
    uploadedBy: row.uploaded_by,
    fileName: row.file_name,
    mimeType: row.mime_type as RecordingMimeType,
    fileSize: row.file_size,
    durationSeconds: row.duration_seconds,
    status: row.status as RecordingStatus,
    failureReason: row.failure_reason,
    consentConfirmedAt: row.consent_confirmed_at,
    uploadedAt: row.uploaded_at,
    deleteAfter: row.delete_after,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Converts storage outages into a client-safe 503 (details go to the log). */
async function storageCall<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (error instanceof StorageUnavailableError) {
      console.error(JSON.stringify({ level: "error", event: "storage_error", error: error.message }));
      throw new ApiError(503, "storage_unavailable", "File storage is temporarily unavailable. Please try again.");
    }
    throw error;
  }
}

/** Loads a recording visible to the caller (RLS). Deleted recordings do not exist for clients. */
async function loadRecording(ctx: Ctx): Promise<RecordingRow> {
  const id = parseId(ctx.params.id, RESOURCE);
  const row = checkMaybe(
    await ctx.supabase
      .from("recordings")
      .select("*")
      .eq("id", id)
      .eq("workspace_id", ctx.params.workspaceId)
      .neq("status", "deleted")
      .maybeSingle(),
    RESOURCE,
  );
  if (!row) throw notFound(RESOURCE);
  return row;
}

async function assertCallExists(ctx: Ctx, callId: string) {
  const call = checkMaybe(
    await ctx.supabase.from("recruiter_calls").select("id").eq("id", callId).eq("workspace_id", ctx.params.workspaceId).maybeSingle(),
    "Call",
  );
  if (!call) throw notFound("Call");
}

function assertUploader(ctx: Ctx, row: RecordingRow) {
  if (row.uploaded_by !== ctx.userId) throw forbidden("Only the person who started this upload can continue it.");
}

async function issueUploadTarget(row: RecordingRow): Promise<RecordingUploadTarget> {
  const target = await storageCall(getRecordingStorage().createUploadUrl(row.storage_path));
  return {
    ...target,
    contentType: row.mime_type as RecordingMimeType,
    maxBytes: row.file_size,
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

/**
 * Removes an object right away and marks its cleanup-queue entries done.
 * Best effort: on failure the scheduled cleanup job retries from the queue.
 */
async function purgeNow(path: string) {
  try {
    await getRecordingStorage().remove([path]);
    await getSupabaseAdmin()
      .from("storage_cleanup_queue")
      .update({ completed_at: new Date().toISOString(), last_error: null })
      .eq("bucket", RECORDINGS_BUCKET)
      .eq("storage_path", path)
      .is("completed_at", null);
  } catch (error) {
    console.error(
      JSON.stringify({ level: "warn", event: "storage_purge_deferred", error: error instanceof Error ? error.message : "unknown" }),
    );
  }
}

const completeSchema = z.object({ durationSeconds: recordingUpdateSchema.shape.durationSeconds.optional() });

export const recordings = {
  /** GET /calls/{id}/recordings — any member. */
  async listForCall(request: NextRequest, ctx: Ctx) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    const callId = parseId(ctx.params.id, "Call");
    await assertCallExists(ctx, callId);
    const params = readQuery(request, recordingListQuerySchema);
    const offset = decodeCursor(params.cursor);
    let query = ctx.supabase.from("recordings").select("*").eq("workspace_id", ctx.params.workspaceId).eq("recruiter_call_id", callId);
    query = params.status === "active" ? query.neq("status", "deleted") : query.eq("status", params.status);
    const rows = check(await query.order("created_at", { ascending: false }).order("id").range(...pageRange(params.limit, offset)), RESOURCE);
    return json<Page<Recording>>(toPage(rows, params.limit, offset, toRecording));
  },

  /**
   * POST /calls/{id}/recordings — editor+. Validates the declared file, creates a
   * pending recording (quota and per-call limits are enforced in the database)
   * and returns a one-time signed upload URL for a server-chosen path.
   */
  async create(request: NextRequest, ctx: Ctx) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const callId = parseId(ctx.params.id, "Call");
    const input = await readBody(request, recordingCreateSchema);

    const extension = recordingExtension(input.fileName)!;
    const format = RECORDING_FORMATS[extension];
    if (input.mimeType && !(format.aliases as readonly string[]).includes(input.mimeType.toLowerCase())) {
      throw new ApiError(400, "validation_failed", "The request contains invalid values.", [
        { path: "mimeType", message: `The file type does not match a .${extension} file.` },
      ]);
    }
    const maxBytes = maxRecordingBytes();
    if (input.fileSize > maxBytes) {
      throw new ApiError(413, "payload_too_large", `Recordings can be at most ${Math.floor(maxBytes / (1024 * 1024))} MB.`);
    }

    await assertCallExists(ctx, callId);
    await enforceRateLimit(ctx.userId, RECORDING_RATE_LIMITS.upload.action, RECORDING_RATE_LIMITS.upload.limit);

    const id = crypto.randomUUID();
    const { data, error } = await ctx.supabase
      .from("recordings")
      .insert({
        id,
        workspace_id: ctx.params.workspaceId,
        recruiter_call_id: callId,
        uploaded_by: ctx.userId,
        file_name: input.fileName,
        storage_path: `${ctx.params.workspaceId}/${callId}/${id}.${extension}`,
        mime_type: format.mimeType,
        file_size: input.fileSize,
        consent_confirmed_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) {
      if (error.hint === "quota_exceeded" || error.hint === "call_limit") {
        throw new ApiError(409, "quota_exceeded", error.message);
      }
      throw fromDatabaseError(error, RESOURCE);
    }

    let upload: RecordingUploadTarget;
    try {
      upload = await issueUploadTarget(data);
    } catch (issueError) {
      // Release the reserved quota; nothing can have been uploaded.
      await getSupabaseAdmin().rpc("mark_recording_failed", { p_id: id, p_reason: "The upload could not be started." });
      throw issueError;
    }
    return json<RecordingUploadResponse>({ recording: toRecording(data), upload }, 201);
  },

  /** GET /recordings/{id} — any member. */
  async get(_request: NextRequest, ctx: Ctx) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "viewer");
    return json(toRecording(await loadRecording(ctx)));
  },

  /** PATCH /recordings/{id} — editor+; only the duration is editable. */
  async update(request: NextRequest, ctx: Ctx) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const input = await readBody(request, recordingUpdateSchema);
    const row = await loadRecording(ctx);
    const updated = check(
      await ctx.supabase
        .from("recordings")
        .update({ duration_seconds: input.durationSeconds })
        .eq("id", row.id)
        .eq("workspace_id", ctx.params.workspaceId)
        .select("*")
        .single(),
      RESOURCE,
    );
    return json(toRecording(updated));
  },

  /** POST /recordings/{id}/upload-url — the uploader; a fresh URL for an interrupted upload. */
  async renewUploadUrl(_request: NextRequest, ctx: Ctx) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const row = await loadRecording(ctx);
    assertUploader(ctx, row);
    if (row.status !== "pending") throw new ApiError(409, "conflict", "This recording is no longer waiting for an upload.");
    await enforceRateLimit(ctx.userId, RECORDING_RATE_LIMITS.upload.action, RECORDING_RATE_LIMITS.upload.limit);
    return json<RecordingUploadResponse>({ recording: toRecording(row), upload: await issueUploadTarget(row) });
  },

  /**
   * POST /recordings/{id}/complete — the uploader. Verifies the stored object
   * (size, content type, audio signature) before the recording becomes playable.
   * Invalid files are removed and the recording is marked failed.
   */
  async complete(request: NextRequest, ctx: Ctx) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const input = await readBody(request, completeSchema);
    const row = await loadRecording(ctx);
    assertUploader(ctx, row);
    if (row.status === "uploaded") return json(toRecording(row)); // idempotent retry
    if (row.status !== "pending") throw new ApiError(409, "conflict", "This recording is no longer waiting for an upload.");

    const storage = getRecordingStorage();
    const object = await storageCall(storage.stat(row.storage_path));
    if (!object) {
      throw new ApiError(409, "upload_incomplete", "The file has not been uploaded yet. Upload it, then try again.");
    }

    const problem = await storageCall(validateObject(row, object.size, object.contentType));
    const admin = getSupabaseAdmin();
    if (problem) {
      checkOk(await admin.rpc("mark_recording_failed", { p_id: row.id, p_reason: problem }), RESOURCE);
      await purgeNow(row.storage_path);
      throw new ApiError(422, "invalid_recording", problem);
    }

    let uploaded = check(await admin.rpc("mark_recording_uploaded", { p_id: row.id }), RESOURCE) as RecordingRow;
    if (input.durationSeconds !== undefined) {
      uploaded = check(
        await ctx.supabase
          .from("recordings")
          .update({ duration_seconds: input.durationSeconds })
          .eq("id", row.id)
          .select("*")
          .single(),
        RESOURCE,
      );
    }
    return json(toRecording(uploaded));
  },

  /** GET /recordings/{id}/playback-url — owner/editor only (D4); a 5-minute signed URL. */
  async playbackUrl(_request: NextRequest, ctx: Ctx) {
    await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const row = await loadRecording(ctx);
    if (row.status !== "uploaded") throw new ApiError(409, "conflict", "This recording is not available for playback.");
    await enforceRateLimit(ctx.userId, RECORDING_RATE_LIMITS.playback.action, RECORDING_RATE_LIMITS.playback.limit);
    const url = await storageCall(getRecordingStorage().createPlaybackUrl(row.storage_path, PLAYBACK_URL_TTL_SECONDS));
    return json<RecordingPlayback>({ url, expiresAt: new Date(Date.now() + PLAYBACK_URL_TTL_SECONDS * 1000).toISOString() });
  },

  /**
   * DELETE /recordings/{id} — the owner, or the editor who uploaded it.
   * Soft-deletes the metadata (queues the object for cleanup) and removes the
   * object immediately when Storage is reachable.
   */
  async remove(_request: NextRequest, ctx: Ctx) {
    const role = await requireWorkspace(ctx, ctx.params.workspaceId, "editor");
    const row = await loadRecording(ctx);
    if (role !== "owner" && row.uploaded_by !== ctx.userId) {
      throw forbidden("Only the workspace owner or the person who uploaded it can delete this recording.");
    }
    check(await getSupabaseAdmin().rpc("soft_delete_recording", { p_id: row.id }), RESOURCE);
    await purgeNow(row.storage_path);
    return noContent();
  },
};

/** Returns a user-facing reason when the stored object is not an acceptable recording. */
async function validateObject(row: RecordingRow, size: number, contentType: string | null): Promise<string | null> {
  if (size !== row.file_size) return "The uploaded file does not match the declared size.";
  if (size > maxRecordingBytes()) return "The uploaded file is too large.";
  if (contentType !== row.mime_type) return "The uploaded file type does not match the recording.";
  const head = await getRecordingStorage().readHead(row.storage_path, SIGNATURE_BYTES);
  if (detectAudioFormat(head) !== row.mime_type) return "The file is not a valid MP3, M4A or WAV recording.";
  return null;
}
