import { describe, expect, it } from "vitest";

import { validateRecordingFile } from "@/features/recordings/validate-recording";
import { formatRelativeDay, fromDateInputValue, parseList, toDateInputValue } from "@/lib/format";

describe("client-side recording checks (convenience; the server re-validates)", () => {
  it("accepts supported files and rejects others", () => {
    expect(validateRecordingFile({ name: "call.MP3", size: 10, type: "audio/mpeg" }).ok).toBe(true);
    expect(validateRecordingFile({ name: "call.m4a", size: 10, type: "" }).ok).toBe(true);
    expect(validateRecordingFile({ name: "call.ogg", size: 10, type: "audio/ogg" }).ok).toBe(false);
    expect(validateRecordingFile({ name: "call.mp3", size: 10, type: "video/mp4" }).ok).toBe(false);
    expect(validateRecordingFile({ name: "empty.wav", size: 0, type: "audio/wav" }).ok).toBe(false);
    expect(validateRecordingFile({ name: "big.wav", size: 11, type: "audio/wav" }, 10).ok).toBe(false);
  });
});

describe("date and list helpers", () => {
  it("round-trips calendar dates without day shifts", () => {
    expect(toDateInputValue(fromDateInputValue("2026-03-29"))).toBe("2026-03-29"); // DST change in many zones
    expect(toDateInputValue(fromDateInputValue("2026-12-31"))).toBe("2026-12-31");
  });

  it("labels relative days", () => {
    const now = new Date(2026, 9, 25, 9, 0);
    expect(formatRelativeDay(new Date(2026, 9, 25, 23, 0).toISOString(), now)).toBe("Today");
    expect(formatRelativeDay(new Date(2026, 9, 26, 1, 0).toISOString(), now)).toBe("Tomorrow");
    expect(formatRelativeDay(new Date(2026, 9, 22, 12, 0).toISOString(), now)).toBe("3 days ago");
  });

  it("splits comma and newline lists", () => {
    expect(parseList("AWS, Terraform\n Linux ,,")).toEqual(["AWS", "Terraform", "Linux"]);
  });
});
