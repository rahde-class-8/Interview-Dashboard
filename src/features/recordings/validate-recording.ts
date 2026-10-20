import { formatFileSize } from "@/lib/format";
import { ACCEPTED_EXTENSIONS, ACCEPTED_MIME_TYPES, MAX_RECORDING_SIZE_BYTES } from "./config";

export type RecordingValidation = { ok: true } | { ok: false; error: string };

/** Client-side checks only; a backend must re-validate uploaded files. */
export function validateRecordingFile(
  file: Pick<File, "name" | "size" | "type">,
  maxBytes = MAX_RECORDING_SIZE_BYTES,
): RecordingValidation {
  const name = file.name.toLowerCase();
  const hasValidExtension = ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
  // Some browsers report an empty MIME type; fall back to the extension then.
  const hasValidType = !file.type || (ACCEPTED_MIME_TYPES as readonly string[]).includes(file.type);

  if (!hasValidExtension || !hasValidType) {
    return { ok: false, error: `“${file.name}” is not a supported format. Use MP3, M4A or WAV.` };
  }
  if (file.size === 0) {
    return { ok: false, error: `“${file.name}” is empty.` };
  }
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `“${file.name}” is ${formatFileSize(file.size)}. The limit is ${formatFileSize(maxBytes)}.`,
    };
  }
  return { ok: true };
}
