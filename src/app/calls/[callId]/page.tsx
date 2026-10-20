import { Suspense } from "react";

import { CallDetailPage } from "@/features/calls/call-detail-page";

export const metadata = { title: "Recruiter Call" };

export default async function Page({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return (
    <Suspense>
      <CallDetailPage callId={callId} />
    </Suspense>
  );
}
