import { z } from "zod";

import { pageQuerySchema, requiredText } from "./common";

/** Supported recording formats. The extension decides the stored format. */
export const RECORDING_FORMATS = {
  mp3: { mimeType: "audio/mpeg", aliases: ["audio/mpeg", "audio/mp3"] },
  m4a: { mimeType: "audio/mp4", aliases: ["audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"] },
  wav: { mimeType: "audio/wav", aliases: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"] },
} as const;

export type RecordingExtension = keyof typeof RECORDING_FORMATS;
export type RecordingMimeType = (typeof RECORDING_FORMATS)[RecordingExtension]["mimeType"];

/** Hard ceiling enforced by the Storage bucket and the database (100 MiB). */
export const RECORDING_HARD_LIMIT_BYTES = 100 * 1024 * 1024;

/** Returns the format for a file name, or null if the extension is not supported. */
export function recordingExtension(fileName: string): RecordingExtension | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  const ext = match?.[1]?.toLowerCase();
  return ext && ext in RECORDING_FORMATS ? (ext as RecordingExtension) : null;
}

export const recordingStatusSchema = z.enum(["pending", "uploaded", "failed", "deleted"]);
export type RecordingStatus = z.infer<typeof recordingStatusSchema>;

export const recordingCreateSchema = z.object({
  fileName: requiredText(255, "File name").refine((name) => recordingExtension(name) !== null, {
    message: "Use an MP3, M4A or WAV file.",
  }),
  fileSize: z.number().int().positive("The file is empty."),
  /** The MIME type reported by the browser; may be empty. Checked against the extension. */
  mimeType: z.string().trim().max(100).optional().default(""),
  /** The user confirms that everyone recorded agreed to the recording. */
  consentConfirmed: z.literal(true, { message: "Confirm that all participants consented to the recording." }),
});
export type RecordingCreateInput = z.input<typeof recordingCreateSchema>;

export const recordingUpdateSchema = z.object({
  durationSeconds: z.number().int().min(0).max(86_400).nullable(),
});

export const recordingListQuerySchema = pageQuerySchema.extend({
  /** Default: everything except deleted recordings. */
  status: z.enum(["active", "uploaded", "pending", "failed"]).default("active"),
});

export interface Recording {
  id: string;
  workspaceId: string;
  callId: string;
  uploadedBy: string | null;
  fileName: string;
  mimeType: RecordingMimeType;
  fileSize: number;
  durationSeconds: number | null;
  status: RecordingStatus;
  failureReason: string | null;
  consentConfirmedAt: string;
  uploadedAt: string | null;
  deleteAfter: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A one-time, path-scoped upload target. Upload with PUT/POST and the given content type. */
export interface RecordingUploadTarget {
  signedUrl: string;
  token: string;
  path: string;
  contentType: RecordingMimeType;
  maxBytes: number;
  expiresAt: string;
}

export interface RecordingUploadResponse {
  recording: Recording;
  upload: RecordingUploadTarget;
}

export interface RecordingPlayback {
  url: string;
  expiresAt: string;
}
