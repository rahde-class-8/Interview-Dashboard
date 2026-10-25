"use client";

import { Check } from "lucide-react";

import { STAGE_LABELS } from "@/lib/format";
import { useMutation } from "@/lib/hooks/use-submit";
import { usePermissions } from "@/lib/store/permissions";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import { OPPORTUNITY_STAGES, type Opportunity } from "@/types";

/** Clickable pipeline progress: New → Recruiter Screen → … → Closed. */
export function StageStepper({ opportunity }: { opportunity: Opportunity }) {
  const { setOpportunityStage } = useActions();
  const mutate = useMutation();
  const { canEdit } = usePermissions();
  const currentIndex = OPPORTUNITY_STAGES.indexOf(opportunity.stage);

  return (
    <ol aria-label="Pipeline stage" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {OPPORTUNITY_STAGES.map((stage, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={stage}>
            <button
              type="button"
              onClick={() => void mutate(() => setOpportunityStage(opportunity.id, stage))}
              disabled={!canEdit}
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 cursor-pointer disabled:cursor-default",
                current && "border-primary bg-primary text-primary-foreground",
                done && "border-primary/30 bg-accent text-accent-foreground",
                !current && !done && "text-muted-foreground enabled:hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  current && "border-primary-foreground/60",
                  done && "border-primary/40",
                )}
                aria-hidden
              >
                {done ? <Check className="size-3" /> : index + 1}
              </span>
              <span className="truncate">{STAGE_LABELS[stage]}</span>
              <span className="sr-only">{done ? "(completed)" : current ? "(current)" : ""}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
