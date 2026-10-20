import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS } from "@/lib/format";
import type { OpportunityStage } from "@/types";

const VARIANTS: Record<OpportunityStage, "secondary" | "accent" | "success" | "warning" | "outline"> = {
  new: "secondary",
  recruiter_screen: "accent",
  technical: "accent",
  hiring_manager: "warning",
  offer: "success",
  closed: "outline",
};

export function StageBadge({ stage }: { stage: OpportunityStage }) {
  return <Badge variant={VARIANTS[stage]}>{STAGE_LABELS[stage]}</Badge>;
}
