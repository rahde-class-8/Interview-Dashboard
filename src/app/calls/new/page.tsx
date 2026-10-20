import { Suspense } from "react";

import { NewCallPage } from "@/features/calls/new-call-page";

export const metadata = { title: "New Recruiter Call" };

export default function Page() {
  return (
    <Suspense>
      <NewCallPage />
    </Suspense>
  );
}
