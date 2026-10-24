import type { RecordingMimeType } from "@/shared/contracts/recordings";

/** Bytes needed by detectAudioFormat. */
export const SIGNATURE_BYTES = 16;

/**
 * Identifies MP3, M4A (MPEG-4 audio) and WAV files from their first bytes.
 * Returns null for anything else. This is a content check on top of the
 * extension and Content-Type, which clients control.
 */
export function detectAudioFormat(head: Uint8Array): RecordingMimeType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...head.subarray(start, end));

  // WAV: "RIFF" <size> "WAVE"
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";

  // MP4 family: <box size> "ftyp" <brand>. Video brands are not accepted.
  if (head.length >= 12 && ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    return ["M4A ", "M4B ", "mp42", "isom", "mp41", "dash", "iso2", "iso5", "iso6"].includes(brand) ? "audio/mp4" : null;
  }

  // MP3: ID3v2 tag, or an MPEG audio frame header (11 sync bits, layer != reserved).
  if (head.length >= 3 && ascii(0, 3) === "ID3") return "audio/mpeg";
  if (head.length >= 2 && head[0] === 0xff && (head[1]! & 0xe0) === 0xe0 && (head[1]! & 0x06) !== 0) return "audio/mpeg";

  return null;
}
