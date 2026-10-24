import "server-only";

import { RECORDING_HARD_LIMIT_BYTES } from "@/shared/contracts/recordings";

const MIB = 1024 * 1024;

/**
 * Maximum upload size. NEXT_PUBLIC_MAX_RECORDING_SIZE_MB (shared with the
 * browser) can lower the limit; the bucket and database cap it at 100 MiB.
 */
export function maxRecordingBytes(): number {
  const configured = Number(process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB);
  const bytes = Number.isFinite(configured) && configured > 0 ? Math.floor(configured * MIB) : RECORDING_HARD_LIMIT_BYTES;
  return Math.min(bytes, RECORDING_HARD_LIMIT_BYTES);
}

/** Per-user hourly limits for actions that create signed URLs. */
export const RECORDING_RATE_LIMITS = {
  upload: { action: "recording_upload", limit: 30 },
  playback: { action: "recording_playback", limit: 120 },
} as const;
