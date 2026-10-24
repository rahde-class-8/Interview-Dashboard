import { Suspense } from "react";

import { QuestionsPage } from "@/features/questions/questions-page";

export const metadata = { title: "Question Bank" };

export default function Page() {
  return (
    <Suspense>
      <QuestionsPage />
    </Suspense>
  );
}
