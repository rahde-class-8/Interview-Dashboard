import "server-only";

import { getSupabaseAdmin } from "../core/supabase/admin";
import { RECORDINGS_BUCKET, getRecordingStorage } from "./storage";

export interface MaintenanceResult {
  abandoned: number;
  expired: number;
  orphansQueued: number;
  tombstonesPurged: number;
  objectsRemoved: number;
  removalFailures: number;
}

const BATCH_SIZE = 100;
const MAX_BATCHES = 10;

/**
 * Scheduled recording maintenance (every 5–15 minutes):
 * 1. database step: fail abandoned uploads, expire recordings past retention,
 *    queue orphaned objects, purge old tombstones (run_recording_maintenance);
 * 2. storage step: remove queued objects. Claims expire after five minutes,
 *    so concurrent or crashed runs never lose entries; each entry is retried
 *    up to 10 times, then left for manual review (see STORAGE.md).
 */
export async function runRecordingMaintenance(): Promise<MaintenanceResult> {
  const admin = getSupabaseAdmin();
  const { data: counts, error } = await admin.rpc("run_recording_maintenance", {});
  if (error) throw new Error(`run_recording_maintenance failed: ${error.code ?? "unknown"}`);

  const result: MaintenanceResult = { ...(counts as Omit<MaintenanceResult, "objectsRemoved" | "removalFailures">), objectsRemoved: 0, removalFailures: 0 };
  const storage = getRecordingStorage();

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data: entries, error: claimError } = await admin.rpc("claim_storage_cleanup", { p_limit: BATCH_SIZE });
    if (claimError) throw new Error(`claim_storage_cleanup failed: ${claimError.code ?? "unknown"}`);
    if (!entries?.length) break;

    const ids = entries.map((entry) => entry.id);
    const paths = entries.filter((entry) => entry.bucket === RECORDINGS_BUCKET).map((entry) => entry.storage_path);
    try {
      await storage.remove(paths);
      await admin
        .from("storage_cleanup_queue")
        .update({ completed_at: new Date().toISOString(), last_error: null, locked_until: null })
        .in("id", ids);
      result.objectsRemoved += entries.length;
    } catch (removeError) {
      await admin
        .from("storage_cleanup_queue")
        .update({ last_error: (removeError instanceof Error ? removeError.message : "removal failed").slice(0, 500) })
        .in("id", ids);
      result.removalFailures += entries.length;
      break; // Storage is likely unavailable; the next run retries.
    }
    if (entries.length < BATCH_SIZE) break;
  }
  return result;
}
