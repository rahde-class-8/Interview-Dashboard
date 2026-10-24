import { AlertCircle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** Form-level status message announced to assistive technology. */
export function FormMessage({ tone, children }: { tone: "error" | "success" | "info"; children?: string }) {
  if (!children) return null;
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        tone === "error" && "border-destructive/40 bg-destructive/5 text-destructive",
        tone === "success" && "border-success/30 bg-success/5 text-success",
        tone === "info" && "border-primary/20 bg-accent/60 text-accent-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}
