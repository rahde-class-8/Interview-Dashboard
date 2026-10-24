import { Suspense } from "react";

import { OpportunitiesPage } from "@/features/opportunities/opportunities-page";

export const metadata = { title: "Opportunities" };

export default function Page() {
  return (
    <Suspense>
      <OpportunitiesPage />
    </Suspense>
  );
}
