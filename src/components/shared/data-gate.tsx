"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppStore } from "@/lib/store/app-store";

/** Renders loading and error states until the workspace data has loaded. */
export function DataGate({ children }: { children: ReactNode }) {
  const { status, error, reload } = useAppStore();

  if (status === "loading") {
    return (
      <div role="status" aria-label="Loading data" className="space-y-6">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
        <AlertTriangle className="size-8 text-destructive" aria-hidden />
        <h2 className="text-lg font-semibold">Something went wrong loading your data</h2>
        <p className="text-sm text-muted-foreground">{error ?? "Your workspace could not be loaded."}</p>
        <Button onClick={() => void reload()}>Try again</Button>
      </div>
    );
  }

  return <>{children}</>;
}
