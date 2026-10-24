import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { runRecordingMaintenance } from "@/server/recordings/maintenance";

export const dynamic = "force-dynamic";

/**
 * POST /api/internal/jobs/recording-maintenance
 * Called by the scheduler with `Authorization: Bearer $CRON_SECRET`.
 * Not part of the public API; disabled when CRON_SECRET is not set.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
  }
  if (!matchesSecret(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: { code: "unauthenticated", message: "Invalid job credentials." } }, { status: 401 });
  }

  try {
    const result = await runRecordingMaintenance();
    console.info(JSON.stringify({ level: "info", event: "recording_maintenance", ...result }));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(
      JSON.stringify({ level: "error", event: "recording_maintenance_failed", error: error instanceof Error ? error.message : "unknown" }),
    );
    return NextResponse.json({ error: { code: "internal_error", message: "Maintenance failed." } }, { status: 500 });
  }
}

function matchesSecret(header: string | null, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
