/**
 * Recording attachment rules. The size limit can be overridden with the
 * NEXT_PUBLIC_MAX_RECORDING_SIZE_MB environment variable.
 */
const DEFAULT_MAX_SIZE_MB = 100;

const envLimit = Number(process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB);

export const MAX_RECORDING_SIZE_MB = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_MAX_SIZE_MB;
export const MAX_RECORDING_SIZE_BYTES = MAX_RECORDING_SIZE_MB * 1024 * 1024;

export const ACCEPTED_EXTENSIONS = [".mp3", ".m4a", ".wav"] as const;

/** MIME types browsers report for the accepted formats. */
export const ACCEPTED_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/vnd.wave",
] as const;

/** Value for <input type="file" accept>. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_EXTENSIONS, ...ACCEPTED_MIME_TYPES].join(",");
