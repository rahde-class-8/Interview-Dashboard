"use client";

import { useRef, useState, type DragEvent } from "react";
import { CheckCircle2, FileAudio, Loader2, RefreshCw, Trash2, Upload, XCircle } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PrototypeNotice } from "@/components/shared/prototype-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatFileSize, formatSeconds } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { getCallRecordings } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import type { ID, RecordingAttachment } from "@/types";
import { AudioPlayer } from "./audio-player";
import { ACCEPT_ATTRIBUTE, MAX_RECORDING_SIZE_MB } from "./config";
import { localFileRegistry, useLocalFile } from "./local-file-registry";
import { useObjectUrl } from "./use-object-url";
import { validateRecordingFile } from "./validate-recording";

type PickerStatus =
  | { state: "idle" }
  | { state: "processing"; fileName: string }
  | { state: "ready"; fileName: string }
  | { state: "error"; message: string };

/** Attach, preview and manage recordings created by an external app. */
export function RecordingAttachments({ callId }: { callId: ID }) {
  const { data } = useAppStore();
  const { addRecording } = useActions();
  const recordings = getCallRecordings(data, callId);
  const [status, setStatus] = useState<PickerStatus>({ state: "idle" });

  function handleFile(file: File) {
    setStatus({ state: "processing", fileName: file.name });
    const result = validateRecordingFile(file);
    if (!result.ok) {
      setStatus({ state: "error", message: result.error });
      return;
    }
    const id = addRecording({
      callId,
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || "audio/unknown",
      storage: "local-preview",
    });
    localFileRegistry.set(id, file);
    setStatus({ state: "ready", fileName: file.name });
  }

  return (
    <div className="space-y-4">
      <PrototypeNotice>
        Recordings are <strong>local previews only</strong>. The file stays in this browser tab&apos;s memory — it is
        not uploaded or stored anywhere, and must be re-selected after a page reload. This app never records calls
        or accesses your microphone; attach recordings made with another app.
      </PrototypeNotice>

      <FileDropZone onFile={handleFile} label="Attach a recording" />
      <PickerStatusMessage status={status} />

      {recordings.length === 0 ? (
        <EmptyState icon={FileAudio} title="No recordings attached" description="Attach an MP3, M4A or WAV file to play it back here." />
      ) : (
        <ul className="space-y-3" aria-label="Attached recordings">
          {recordings.map((recording) => (
            <AttachmentItem key={recording.id} recording={recording} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileDropZone({ onFile, label, compact = false }: { onFile: (file: File) => void; label: string; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT_ATTRIBUTE}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
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
        <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
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
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
        dragging && "border-primary bg-accent/50",
      )}
    >
      <Upload className="size-6 text-muted-foreground" aria-hidden />
      <p className="text-sm">Drag a recording here, or</p>
      <Button onClick={() => inputRef.current?.click()}>
        <FileAudio /> Choose audio file
      </Button>
      <p className="text-xs text-muted-foreground">MP3, M4A or WAV · up to {MAX_RECORDING_SIZE_MB} MB</p>
      {input}
    </div>
  );
}

function PickerStatusMessage({ status }: { status: PickerStatus }) {
  return (
    <div aria-live="polite" className="min-h-0 text-sm">
      {status.state === "processing" && (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Checking “{status.fileName}”…
        </p>
      )}
      {status.state === "ready" && (
        <p className="flex items-center gap-2 text-success">
          <CheckCircle2 className="size-4" aria-hidden /> “{status.fileName}” is ready to preview locally. It has not been
          uploaded.
        </p>
      )}
      {status.state === "error" && (
        <p role="alert" className="flex items-center gap-2 text-destructive">
          <XCircle className="size-4 shrink-0" aria-hidden /> {status.message}
        </p>
      )}
    </div>
  );
}

function AttachmentItem({ recording }: { recording: RecordingAttachment }) {
  const { removeRecording, updateRecording } = useActions();
  const file = useLocalFile(recording.id);
  const url = useObjectUrl(file);
  const [replaceError, setReplaceError] = useState<string>();
  const extension = recording.fileName.split(".").pop()?.toUpperCase() ?? "AUDIO";

  function handleReplace(next: File) {
    const result = validateRecordingFile(next);
    if (!result.ok) {
      setReplaceError(result.error);
      return;
    }
    setReplaceError(undefined);
    // Swapping the File causes useObjectUrl to revoke the previous URL.
    localFileRegistry.set(recording.id, next);
    updateRecording(recording.id, {
      fileName: next.name,
      fileSizeBytes: next.size,
      mimeType: next.type || "audio/unknown",
      durationSeconds: undefined,
      storage: "local-preview",
    });
  }

  function handleRemove() {
    localFileRegistry.delete(recording.id);
    removeRecording(recording.id);
  }

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
              {recording.durationSeconds ? ` · ${formatSeconds(recording.durationSeconds)}` : ""} · Added{" "}
              {formatDateTime(recording.addedAt)}
            </p>
            <div className="mt-1.5">
              {file ? (
                <Badge variant="accent">Local preview · not uploaded</Badge>
              ) : (
                <Badge variant="warning">File not loaded in this session</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <FileDropZone compact onFile={handleReplace} label={file ? "Replace" : "Re-select file"} />
          <ConfirmDeleteDialog
            title="Remove recording?"
            description={`“${recording.fileName}” will be detached from this call. Your original file is not affected.`}
            confirmLabel="Remove"
            onConfirm={handleRemove}
            trigger={
              <Button variant="ghost" size="sm" className="text-destructive">
                <Trash2 /> Remove
              </Button>
            }
          />
        </div>
      </div>
      {replaceError && (
        <p role="alert" className="text-sm text-destructive">
          {replaceError}
        </p>
      )}
      {url ? (
        <AudioPlayer
          src={url}
          label={recording.fileName}
          onDuration={(seconds) => {
            if (seconds !== recording.durationSeconds) updateRecording(recording.id, { durationSeconds: seconds });
          }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          No audio file is loaded for this attachment in this browser session. Re-select the original file to preview it.
        </p>
      )}
    </li>
  );
}
