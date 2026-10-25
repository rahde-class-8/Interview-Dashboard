"use client";

/**
 * Sends a file straight to object storage with a one-time signed URL. XHR is
 * used (not fetch) so upload progress can be reported. The audio never passes
 * through the app's own server.
 */
export function putFile(
  url: string,
  file: Blob,
  contentType: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else if (xhr.status === 409 || /already exists/i.test(xhr.responseText)) {
        resolve(); // an earlier attempt already stored the file; verification decides
      } else {
        reject(new UploadError(xhr.status === 400 || xhr.status === 403 ? "expired" : "failed"));
      }
    };
    xhr.onerror = () => reject(new UploadError("network"));
    xhr.onabort = () => reject(new UploadError("aborted"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export class UploadError extends Error {
  constructor(readonly reason: "network" | "expired" | "failed" | "aborted") {
    super(
      reason === "network"
        ? "The upload was interrupted. Check your connection and retry."
        : reason === "expired"
          ? "The upload link expired. Retry to get a new one."
          : reason === "aborted"
            ? "Upload cancelled."
            : "The file could not be uploaded. Please retry.",
    );
    this.name = "UploadError";
  }
}

/** Reads the duration (seconds) of a local audio file, if the browser can decode its header. */
export function readDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration) : undefined);
    audio.onerror = () => done(undefined);
    setTimeout(() => done(undefined), 5000);
    audio.src = url;
  });
}
