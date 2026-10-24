import "server-only";

import { getSupabaseAdmin } from "../core/supabase/admin";

export const RECORDINGS_BUCKET = "recordings";

/** Supabase signed upload URLs are valid for two hours (not configurable). */
export const UPLOAD_URL_TTL_SECONDS = 2 * 60 * 60;
/** Playback URLs are short-lived; clients request a fresh one when it expires. */
export const PLAYBACK_URL_TTL_SECONDS = 5 * 60;

export interface StoredObject {
  size: number;
  contentType: string | null;
}

export interface UploadTarget {
  signedUrl: string;
  token: string;
  path: string;
}

/**
 * Object storage used for recordings. All methods use privileged credentials
 * and must only be called after the caller's permissions were checked.
 * Keeping this interface small makes the backing store replaceable (e.g. S3).
 */
export interface RecordingStorage {
  /** A one-time URL that allows uploading exactly this path (no overwrite). */
  createUploadUrl(path: string): Promise<UploadTarget>;
  /** A short-lived URL to stream the object. */
  createPlaybackUrl(path: string, ttlSeconds: number): Promise<string>;
  /** Object metadata, or null if it does not exist. */
  stat(path: string): Promise<StoredObject | null>;
  /** The first `bytes` bytes of the object. */
  readHead(path: string, bytes: number): Promise<Uint8Array>;
  /** Removes objects; missing objects are not an error. */
  remove(paths: string[]): Promise<void>;
}

export class StorageUnavailableError extends Error {
  constructor(operation: string, cause?: unknown) {
    super(`Storage ${operation} failed`, { cause });
    this.name = "StorageUnavailableError";
  }
}

function supabaseRecordingStorage(): RecordingStorage {
  const bucket = () => getSupabaseAdmin().storage.from(RECORDINGS_BUCKET);

  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket().createSignedUploadUrl(path, { upsert: false });
      if (error || !data) throw new StorageUnavailableError("createUploadUrl", error);
      return { signedUrl: data.signedUrl, token: data.token, path: data.path };
    },

    async createPlaybackUrl(path, ttlSeconds) {
      const { data, error } = await bucket().createSignedUrl(path, ttlSeconds);
      if (error || !data) throw new StorageUnavailableError("createPlaybackUrl", error);
      return data.signedUrl;
    },

    async stat(path) {
      const { data, error } = await bucket().info(path);
      if (error) {
        const status = (error as { statusCode?: string | number; status?: number }).statusCode ?? (error as { status?: number }).status;
        if (Number(status) === 404 || Number(status) === 400) return null;
        throw new StorageUnavailableError("stat", error);
      }
      return { size: data.size ?? 0, contentType: data.contentType ?? null };
    },

    async readHead(path, bytes) {
      // Ranged read through a one-minute signed URL, so validation never downloads
      // the whole file and the secret key is never sent outside the SDK.
      const { data, error } = await bucket().createSignedUrl(path, 60);
      if (error || !data) throw new StorageUnavailableError("readHead", error);
      const response = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${bytes - 1}` }, cache: "no-store" });
      if (!response.ok) throw new StorageUnavailableError("readHead", response.status);
      return new Uint8Array(await response.arrayBuffer()).subarray(0, bytes);
    },

    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new StorageUnavailableError("remove", error);
    },
  };
}

let storage: RecordingStorage | undefined;

export function getRecordingStorage(): RecordingStorage {
  storage ??= supabaseRecordingStorage();
  return storage;
}
