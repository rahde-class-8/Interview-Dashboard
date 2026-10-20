"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_LABELS } from "@/lib/format";
import { useActions } from "@/lib/store/use-actions";
import { OPPORTUNITY_STAGES, type Opportunity } from "@/types";

/** Dropdown that moves an opportunity to a different pipeline stage. */
export function StageSelect({
  opportunity,
  size = "sm",
  className,
}: {
  opportunity: Opportunity;
  size?: "sm" | "default";
  className?: string;
}) {
  const { setOpportunityStage } = useActions();

  return (
    <Select
      value={opportunity.stage}
      onValueChange={(stage) => setOpportunityStage(opportunity.id, stage as Opportunity["stage"])}
    >
      <SelectTrigger size={size} className={className} aria-label={`Stage for ${opportunity.title}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPPORTUNITY_STAGES.map((stage) => (
          <SelectItem key={stage} value={stage}>
            {STAGE_LABELS[stage]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
