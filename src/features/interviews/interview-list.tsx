"use client";

import Link from "next/link";
import { CalendarClock, Pencil, Trash2 } from "lucide-react";

import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNow } from "@/hooks/use-now";
import {
  formatDateTime,
  formatDuration,
  formatRelativeDay,
  INTERVIEW_FORMAT_LABELS,
  INTERVIEW_OUTCOME_LABELS,
  INTERVIEW_STATUS_LABELS,
  STAGE_LABELS,
} from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import type { Interview, InterviewOutcome, InterviewStatus } from "@/types";
import { InterviewFormDialog } from "./interview-form-dialog";

/** Interview rows with inline status and outcome controls. */
export function InterviewList({
  interviews,
  showOpportunity = false,
  emptyTitle = "No interviews",
}: {
  interviews: Interview[];
  showOpportunity?: boolean;
  emptyTitle?: string;
}) {
  const { data } = useAppStore();
  const { updateInterview, deleteInterview } = useActions();
  const now = useNow();

  if (interviews.length === 0) return <EmptyState icon={CalendarClock} title={emptyTitle} />;

  return (
    <ul className="@container divide-y rounded-lg border">
      {interviews.map((interview) => {
        const opp = findById(data.opportunities, interview.opportunityId);
        const company = findById(data.companies, opp?.companyId);
        const upcoming = interview.status === "scheduled" && new Date(interview.scheduledAt) >= now;
        return (
          <li key={interview.id} className="flex flex-col gap-3 p-3 @2xl:flex-row @2xl:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{interview.title}</p>
                <Badge variant="outline">{STAGE_LABELS[interview.stage]}</Badge>
                {upcoming && <Badge variant="accent">{formatRelativeDay(interview.scheduledAt, now)}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(interview.scheduledAt)} · {formatDuration(interview.durationMinutes)} ·{" "}
                {INTERVIEW_FORMAT_LABELS[interview.format]}
                {interview.interviewers.length > 0 && ` · with ${interview.interviewers.join(", ")}`}
              </p>
              {showOpportunity && opp && (
                <Link href={`/opportunities/${opp.id}`} className="text-xs text-primary hover:underline">
                  {company?.name} — {opp.title}
                </Link>
              )}
              {interview.notes && <p className="mt-1 text-xs text-muted-foreground">{interview.notes}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={interview.status}
                onValueChange={(v) => updateInterview(interview.id, { status: v as InterviewStatus })}
              >
                <SelectTrigger size="sm" className="w-36" aria-label={`Status for ${interview.title}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVIEW_STATUS_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={interview.outcome}
                onValueChange={(v) => updateInterview(interview.id, { outcome: v as InterviewOutcome })}
              >
                <SelectTrigger size="sm" className="w-32" aria-label={`Outcome for ${interview.title}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(INTERVIEW_OUTCOME_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <InterviewFormDialog
                interview={interview}
                opportunityId={interview.opportunityId}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${interview.title}`}>
                    <Pencil />
                  </Button>
                }
              />
              <ConfirmDeleteDialog
                title="Delete interview?"
                description={`“${interview.title}” will be removed from this prototype session.`}
                onConfirm={() => deleteInterview(interview.id)}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${interview.title}`}>
                    <Trash2 />
                  </Button>
                }
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
