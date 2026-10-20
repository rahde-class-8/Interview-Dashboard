"use client";

import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangle}
      title="Something went wrong on this page"
      description="Try again. If the problem persists, reload to restore the sample data."
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
