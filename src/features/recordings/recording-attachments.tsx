"use client";

import { useRef, useState, type DragEvent } from "react";
import { AlertTriangle, CheckCircle2, FileAudio, Loader2, Play, RefreshCw, Trash2, Upload, X, XCircle } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PrototypeNotice } from "@/components/shared/prototype-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toaster";
import { ApiClientError, errorMessage } from "@/lib/api/client";
import { formatDate, formatDateTime, formatFileSize, formatSeconds } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { usePermissions } from "@/lib/store/permissions";
import { getCallRecordings } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import type { RecordingUploadTarget } from "@/shared/contracts/recordings";
import type { ID, RecordingAttachment } from "@/types";
import { AudioPlayer } from "./audio-player";
import { ACCEPT_ATTRIBUTE, MAX_RECORDING_SIZE_MB } from "./config";
import { UploadError, putFile, readDuration } from "./upload";
import { validateRecordingFile } from "./validate-recording";

type UploadState =
  | { phase: "idle" }
  | { phase: "starting" | "verifying"; fileName: string }
  | { phase: "uploading"; fileName: string; progress: number }
  | { phase: "done"; fileName: string }
  | { phase: "error"; fileName?: string; message: string; retry?: () => void };

/**
 * Upload, verify, play and delete recordings created by an external app.
 * Files go straight to private storage via one-time signed URLs; playback uses
 * 5-minute signed URLs and is limited to owners and editors.
 */
export function RecordingAttachments({ callId }: { callId: ID }) {
  const { data } = useAppStore();
  const { canEdit } = usePermissions();
  const recordings = getCallRecordings(data, callId);

  return (
    <div className="space-y-4">
      <PrototypeNotice>
        This app never records calls or uses your microphone. Upload recordings you made with another app, only with
        everyone&apos;s consent. Files are stored privately and can only be played by this workspace&apos;s owner and
        editors.
      </PrototypeNotice>

      {canEdit && <Uploader callId={callId} />}

      {recordings.length === 0 ? (
        <EmptyState
          icon={FileAudio}
          title="No recordings yet"
          description={canEdit ? "Upload an MP3, M4A or WAV file to play it back here." : "No recordings have been uploaded for this call."}
        />
      ) : (
        <ul className="space-y-3" aria-label="Recordings">
          {recordings.map((recording) => (
            <RecordingItem key={recording.id} recording={recording} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Upload one file: start (server validates and reserves) → PUT to storage → complete (server verifies). */
function useUpload(callId: ID) {
  const actions = useActions();
  const toast = useToast();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);

  async function transfer(recordingId: ID, file: File, target: RecordingUploadTarget, durationSeconds: number | undefined) {
    abort.current = new AbortController();
    setState({ phase: "uploading", fileName: file.name, progress: 0 });
    await putFile(target.signedUrl, file, target.contentType, (progress) => setState({ phase: "uploading", fileName: file.name, progress }), abort.current.signal);
    setState({ phase: "verifying", fileName: file.name });
    await actions.completeRecordingUpload(recordingId, durationSeconds);
    setState({ phase: "done", fileName: file.name });
    toast.success("Recording uploaded", file.name);
  }

  async function run(file: File, existing?: Pick<RecordingAttachment, "id" | "fileName" | "fileSizeBytes">) {
    const check = validateRecordingFile(file);
    if (!check.ok) {
      setState({ phase: "error", fileName: file.name, message: check.error });
      return;
    }
    if (existing && (existing.fileName !== file.name || existing.fileSizeBytes !== file.size)) {
      setState({ phase: "error", fileName: file.name, message: `Select the original file “${existing.fileName}” to resume this upload.` });
      return;
    }

    let recordingId = existing?.id;
    const durationSeconds = await readDuration(file);
    try {
      setState({ phase: "starting", fileName: file.name });
      const { recording, upload } = existing
        ? await actions.renewRecordingUpload(existing.id)
        : await actions.startRecordingUpload(callId, { fileName: file.name, fileSize: file.size, mimeType: file.type, consentConfirmed: true });
      recordingId = recording.id;
      await transfer(recording.id, file, upload, durationSeconds);
    } catch (error) {
      if (error instanceof UploadError && error.reason === "aborted") {
        setState({ phase: "error", fileName: file.name, message: "Upload cancelled. You can resume it later from the list below." });
        return;
      }
      const resumeId = recordingId;
      const rejected = error instanceof ApiClientError && (error.code === "invalid_recording" || (!resumeId && error.status < 500));
      setState({
        phase: "error",
        fileName: file.name,
        message: error instanceof UploadError ? error.message : errorMessage(error),
        // Interruptions and outages can be retried (resuming the same recording); rejected files cannot.
        retry: rejected
          ? undefined
          : resumeId
            ? () => void run(file, { id: resumeId, fileName: file.name, fileSizeBytes: file.size })
            : () => void run(file),
      });
    } finally {
      abort.current = null;
    }
  }

  return { state, run, cancel: () => abort.current?.abort(), clear: () => setState({ phase: "idle" }) };
}

function Uploader({ callId }: { callId: ID }) {
  const [consent, setConsent] = useState(false);
  const upload = useUpload(callId);
  const busy = upload.state.phase === "starting" || upload.state.phase === "uploading" || upload.state.phase === "verifying";

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border p-3">
        <Checkbox id={`consent-${callId}`} className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(v === true)} disabled={busy} />
        <label htmlFor={`consent-${callId}`} className="cursor-pointer text-sm">
          Everyone in this recording agreed to be recorded, and I&apos;m allowed to store it.
          <span className="block text-xs text-muted-foreground">Required before uploading. The confirmation time is saved with the recording.</span>
        </label>
      </div>
      <FileDropZone onFile={(file) => void upload.run(file)} label="Upload a recording" disabled={!consent || busy} />
      <UploadStatus state={upload.state} onCancel={upload.cancel} onDismiss={upload.clear} />
    </div>
  );
}

function FileDropZone({
  onFile,
  label,
  compact = false,
  disabled = false,
}: {
  onFile: (file: File) => void;
  label: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !disabled) onFile(file);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT_ATTRIBUTE}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      disabled={disabled}
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
        e.target.value = ""; // allow selecting the same file again
      }}
    />
  );

  if (compact) {
    return (
      <>
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
          <RefreshCw /> {label}
        </Button>
        {input}
      </>
    );
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
        dragging && "border-primary bg-accent/50",
        disabled && "opacity-60",
      )}
    >
      <Upload className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm">Drag a recording here, or</p>
      <Button disabled={disabled} onClick={() => inputRef.current?.click()}>
        <FileAudio /> {label}
      </Button>
      <p className="text-xs text-muted-foreground">MP3, M4A or WAV · up to {MAX_RECORDING_SIZE_MB} MB</p>
      {input}
    </div>
  );
}

function UploadStatus({ state, onCancel, onDismiss }: { state: UploadState; onCancel: () => void; onDismiss: () => void }) {
  return (
    <div aria-live="polite" className="text-sm">
      {(state.phase === "starting" || state.phase === "verifying") && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {state.phase === "starting" ? `Preparing “${state.fileName}”…` : `Verifying “${state.fileName}”…`}
        </p>
      )}
      {state.phase === "uploading" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">Uploading “{state.fileName}”… {Math.round(state.progress * 100)}%</span>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <X /> Cancel
            </Button>
          </div>
          <Progress value={state.progress * 100} aria-label="Upload progress" />
        </div>
      )}
      {state.phase === "done" && (
        <p className="flex items-center gap-2 text-success">
          <CheckCircle2 className="size-4" aria-hidden /> “{state.fileName}” was uploaded and verified.
        </p>
      )}
      {state.phase === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
          <XCircle className="size-4 shrink-0" aria-hidden /> <span className="min-w-0 flex-1">{state.message}</span>
          {state.retry && (
            <Button size="sm" variant="outline" onClick={state.retry}>
              <RefreshCw /> Retry
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Dismiss upload message">
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}

function RecordingItem({ recording }: { recording: RecordingAttachment }) {
  const { data } = useAppStore();
  const { canEdit, canPlayRecordings, isOwner } = usePermissions();
  const actions = useActions();
  const upload = useUpload(recording.callId);
  const extension = recording.fileName.split(".").pop()?.toUpperCase() ?? "AUDIO";
  const isUploader = recording.uploadedBy === data.currentUser.id;
  const canDelete = isOwner || (canEdit && isUploader);
  const uploading = upload.state.phase !== "idle" && upload.state.phase !== "error";

  return (
    <li className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <FileAudio className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{recording.fileName}</p>
            <p className="text-xs text-muted-foreground">
              {extension} · {formatFileSize(recording.fileSizeBytes)}
              {recording.durationSeconds ? ` · ${formatSeconds(recording.durationSeconds)}` : ""} · Added {formatDateTime(recording.addedAt)}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {recording.status === "uploaded" && <Badge variant="success">Stored privately</Badge>}
              {recording.status === "pending" && <Badge variant="warning">Upload not finished</Badge>}
              {recording.status === "failed" && <Badge variant="destructive">Upload failed</Badge>}
              {recording.deleteAfter && <Badge variant="outline">Auto-deletes {formatDate(recording.deleteAfter)}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {recording.status === "pending" && canEdit && isUploader && !uploading && (
            <FileDropZone compact label="Resume upload" onFile={(file) => void upload.run(file, recording)} />
          )}
          {canDelete && (
            <ConfirmDeleteDialog
              title="Delete recording?"
              description={`“${recording.fileName}” will be permanently deleted from storage for everyone in this workspace. Your original file is not affected.`}
              onConfirm={() => actions.deleteRecording(recording.id)}
              trigger={
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              }
            />
          )}
        </div>
      </div>

      <UploadStatus state={upload.state} onCancel={upload.cancel} onDismiss={upload.clear} />

      {recording.status === "failed" && recording.failureReason && (
        <p className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {recording.failureReason}
        </p>
      )}
      {recording.status === "pending" && !uploading && (
        <p className="text-xs text-muted-foreground">
          {isUploader
            ? "This upload was interrupted. Select the same file to resume it, or delete it."
            : "Someone is still uploading this recording."}
        </p>
      )}
      {recording.status === "uploaded" &&
        (canPlayRecordings ? (
          <Playback recording={recording} />
        ) : (
          <p className="text-xs text-muted-foreground">Playback is available to the workspace owner and editors.</p>
        ))}
    </li>
  );
}

/** Requests a 5-minute signed URL on demand and refreshes it if it expires mid-playback. */
function Playback({ recording }: { recording: RecordingAttachment }) {
  const { getPlaybackUrl, setRecordingDuration } = useActions();
  const { canEdit } = usePermissions();
  const [url, setUrl] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  async function load() {
    setLoading(true);
    setError(undefined);
    try {
      setUrl((await getPlaybackUrl(recording.id)).url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (!url) {
    return (
      <div className="space-y-2">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Play />} {loading ? "Loading…" : "Play recording"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <AudioPlayer
      src={url}
      autoPlay
      label={recording.fileName}
      refreshSource={async () => (await getPlaybackUrl(recording.id)).url}
      onDuration={(seconds) => {
        if (canEdit && !recording.durationSeconds && seconds > 0) void setRecordingDuration(recording.id, seconds).catch(() => undefined);
      }}
    />
  );
}
