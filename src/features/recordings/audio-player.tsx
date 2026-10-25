"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatSeconds } from "@/lib/format";

const PLAYBACK_RATES = [1, 1.25, 1.5, 2];

/**
 * Accessible audio player with play/pause, seek, skip, mute and speed.
 * `refreshSource` handles short-lived signed URLs: when the source fails (e.g.
 * expired), a fresh URL is requested and playback resumes at the same position.
 */
export function AudioPlayer({
  src: initialSrc,
  label,
  onDuration,
  refreshSource,
  autoPlay = false,
}: {
  src: string;
  label: string;
  onDuration?: (seconds: number) => void;
  refreshSource?: () => Promise<string>;
  autoPlay?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState(initialSrc);
  const resume = useRef<{ at: number; play: boolean } | null>(null);
  const refreshAttempts = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [error, setError] = useState<string>();

  // Reset state whenever a different recording is shown.
  const [lastSrc, setLastSrc] = useState(initialSrc);
  if (initialSrc !== lastSrc) {
    setLastSrc(initialSrc);
    setSrc(initialSrc);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setError(undefined);
  }

  async function handleSourceError() {
    const audio = audioRef.current;
    if (refreshSource && audio && refreshAttempts.current < 2) {
      refreshAttempts.current += 1;
      resume.current = { at: audio.currentTime || current, play: playing };
      try {
        setSrc(await refreshSource());
        return;
      } catch {
        // fall through to the error message
      }
    }
    setError(refreshSource ? "The recording could not be loaded. Try again later." : "This browser could not decode the audio file.");
  }

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setError("Playback failed. The file may be corrupted or unsupported by this browser.");
      }
    } else {
      audio.pause();
    }
  };

  const seek = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.min(Math.max(seconds, 0), duration);
    setCurrent(audio.currentTime);
  };

  const cycleRate = () => {
    const next = PLAYBACK_RATES[(PLAYBACK_RATES.indexOf(rate) + 1) % PLAYBACK_RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <audio
        ref={audioRef}
        src={src}
        autoPlay={autoPlay}
        preload="metadata"
        muted={muted}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          setCurrent(e.currentTarget.currentTime);
          refreshAttempts.current = 0;
        }}
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          const d = audio.duration;
          if (Number.isFinite(d)) {
            setDuration(d);
            onDuration?.(Math.round(d));
          }
          if (resume.current) {
            audio.currentTime = resume.current.at;
            if (resume.current.play) void audio.play().catch(() => undefined);
            resume.current = null;
          }
        }}
        onError={() => void handleSourceError()}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="icon"
          onClick={toggle}
          disabled={!!error}
          aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => seek(current - 15)} disabled={!duration} aria-label="Back 15 seconds">
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => seek(current + 15)} disabled={!duration} aria-label="Forward 15 seconds">
          <RotateCw />
        </Button>
        <div className="flex min-w-40 flex-1 items-center gap-3">
          <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">{formatSeconds(current)}</span>
          <Slider
            value={[current]}
            max={duration || 1}
            step={1}
            disabled={!duration}
            onValueChange={([v]) => seek(v)}
            aria-label="Playback position"
            aria-valuetext={`${formatSeconds(current)} of ${formatSeconds(duration)}`}
          />
          <span className="w-12 text-xs tabular-nums text-muted-foreground">{formatSeconds(duration)}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={cycleRate} aria-label={`Playback speed ${rate}x`} className="w-12 tabular-nums">
          {rate}x
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setMuted((m) => !m)} aria-label={muted ? "Unmute" : "Mute"} aria-pressed={muted}>
          {muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </div>
      <div
        className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={duration ? Math.round((current / duration) * 100) : 0}
      >
        <div className="h-full bg-primary/60" style={{ width: `${duration ? (current / duration) * 100 : 0}%` }} />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
