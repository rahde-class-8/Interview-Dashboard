import { Suspense } from "react";

import { PreparationPage } from "@/features/preparation/preparation-page";

export const metadata = { title: "Interview Preparation" };

export default function Page() {
  return (
    <Suspense>
      <PreparationPage />
    </Suspense>
  );
}
