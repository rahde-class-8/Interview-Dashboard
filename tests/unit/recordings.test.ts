import { afterEach, describe, expect, it } from "vitest";

import { maxRecordingBytes } from "@/server/recordings/config";
import { detectAudioFormat } from "@/server/recordings/formats";
import { RECORDING_HARD_LIMIT_BYTES, recordingCreateSchema, recordingExtension } from "@/shared/contracts/recordings";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

describe("detectAudioFormat", () => {
  it("recognizes MP3 with an ID3 tag or a bare MPEG audio frame", () => {
    expect(detectAudioFormat(bytes("ID3", [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe("audio/mpeg");
    expect(detectAudioFormat(bytes([0xff, 0xfb, 0x90, 0x64], new Array(12).fill(0)))).toBe("audio/mpeg");
  });

  it("recognizes M4A (MPEG-4 audio) brands", () => {
    expect(detectAudioFormat(bytes([0, 0, 0, 0x20], "ftypM4A ", [0, 0, 0, 0]))).toBe("audio/mp4");
    expect(detectAudioFormat(bytes([0, 0, 0, 0x18], "ftypisom", [0, 0, 0, 0]))).toBe("audio/mp4");
  });

  it("recognizes WAV", () => {
    expect(detectAudioFormat(bytes("RIFF", [0x24, 0, 0, 0], "WAVEfmt "))).toBe("audio/wav");
  });

  it("rejects other content", () => {
    expect(detectAudioFormat(bytes("hello, this is not audio"))).toBeNull();
    expect(detectAudioFormat(bytes([0x25, 0x50, 0x44, 0x46], "-1.7 xxxxxxxx"))).toBeNull(); // PDF
    expect(detectAudioFormat(bytes("RIFF", [0, 0, 0, 0], "AVI LIST"))).toBeNull(); // AVI
    expect(detectAudioFormat(bytes([0, 0, 0, 0x20], "ftypqt  ", [0, 0, 0, 0]))).toBeNull(); // QuickTime video
    expect(detectAudioFormat(bytes([0xff, 0xf1, 0x50, 0x80]))).toBeNull(); // AAC ADTS (layer 0), not MP3
    expect(detectAudioFormat(new Uint8Array())).toBeNull();
  });
});

describe("recording contracts", () => {
  it("derives the format from the extension", () => {
    expect(recordingExtension("Call with Dana.MP3")).toBe("mp3");
    expect(recordingExtension("screen.m4a")).toBe("m4a");
    expect(recordingExtension("a.wav ")).toBe("wav");
    expect(recordingExtension("notes.txt")).toBeNull();
    expect(recordingExtension("mp3")).toBeNull();
  });

  it("requires consent, a supported file name and a positive size", () => {
    const valid = { fileName: "call.mp3", fileSize: 1024, consentConfirmed: true };
    expect(recordingCreateSchema.parse(valid)).toMatchObject({ mimeType: "" });
    expect(recordingCreateSchema.safeParse({ ...valid, consentConfirmed: false }).success).toBe(false);
    expect(recordingCreateSchema.safeParse({ fileName: "call.mp3", fileSize: 1024 }).success).toBe(false);
    expect(recordingCreateSchema.safeParse({ ...valid, fileName: "call.ogg" }).success).toBe(false);
    expect(recordingCreateSchema.safeParse({ ...valid, fileSize: 0 }).success).toBe(false);
    expect(recordingCreateSchema.safeParse({ ...valid, fileSize: 1.5 }).success).toBe(false);
  });
});

describe("maxRecordingBytes", () => {
  const original = process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB;
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB;
    else process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB = original;
  });

  it("defaults to the 100 MiB hard limit", () => {
    delete process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB;
    expect(maxRecordingBytes()).toBe(RECORDING_HARD_LIMIT_BYTES);
  });

  it("can be lowered but never raised above the hard limit", () => {
    process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB = "25";
    expect(maxRecordingBytes()).toBe(25 * 1024 * 1024);
    process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB = "500";
    expect(maxRecordingBytes()).toBe(RECORDING_HARD_LIMIT_BYTES);
    process.env.NEXT_PUBLIC_MAX_RECORDING_SIZE_MB = "nonsense";
    expect(maxRecordingBytes()).toBe(RECORDING_HARD_LIMIT_BYTES);
  });
});
