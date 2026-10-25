"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Pencil, SearchX, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StageBadge } from "@/components/shared/stage-badge";
import { TagList } from "@/components/shared/tag-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordingAttachments } from "@/features/recordings/recording-attachments";
import { useNow } from "@/hooks/use-now";
import {
  EMPLOYMENT_TYPE_LABELS,
  formatCompensation,
  formatDate,
  formatDateTime,
  formatDuration,
  formatRelativeDay,
  WORK_MODE_LABELS,
} from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById, getCallFollowUp, getCallRecordings, isOverdue } from "@/lib/store/selectors";
import { useMutation } from "@/lib/hooks/use-submit";
import { usePermissions } from "@/lib/store/permissions";
import { useActions } from "@/lib/store/use-actions";
import { useToast } from "@/components/ui/toaster";
import type { ID } from "@/types";
import { CallForm } from "./call-form";

const VIEW_TABS = ["overview", "intelligence", "recording", "notes"] as const;
type ViewTab = (typeof VIEW_TABS)[number];

export function CallDetailPage({ callId }: { callId: ID }) {
  const { data } = useAppStore();
  const { deleteCall, toggleFollowUp } = useActions();
  const { canEdit } = usePermissions();
  const mutate = useMutation();
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const now = useNow();
  const call = findById(data.calls, callId);

  if (!call) {
    return (
      <EmptyState
        icon={SearchX}
        title="Recruiter call not found"
        description="It may have been deleted, or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/calls">Back to calls</Link>
          </Button>
        }
      />
    );
  }

  const opportunity = findById(data.opportunities, call.opportunityId);
  const company = findById(data.companies, opportunity?.companyId);
  const recruiter = findById(data.recruiters, call.recruiterId);
  const followUp = getCallFollowUp(data, call.id);
  const recordings = getCallRecordings(data, call.id).filter((r) => r.status === "uploaded");
  const editing = canEdit && searchParams.get("edit") === "1";
  const tabParam = searchParams.get("tab");
  const tab: ViewTab = (VIEW_TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as ViewTab) : "overview";

  const title = `${recruiter?.name ?? "No recruiter"} · ${company?.name ?? "Unknown company"}`;

  if (editing) {
    return (
      <>
        <PageHeader title="Edit recruiter call" description={title} />
        {/* Keyed by id: background refreshes must not reset a form being edited. */}
        <CallForm key={call.id} call={call} />
      </>
    );
  }

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/calls">
          <ArrowLeft /> Recruiter calls
        </Link>
      </Button>
      <PageHeader
        title={title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {opportunity ? (
              <Link href={`/opportunities/${opportunity.id}`} className="text-primary hover:underline">
                {opportunity.title}
              </Link>
            ) : (
              "Unknown role"
            )}
            · {formatDateTime(call.callDateTime)} · {formatDuration(call.durationMinutes)}
            {opportunity && <StageBadge stage={opportunity.stage} />}
          </span>
        }
        actions={
          canEdit && (
          <>
            <Button asChild variant="outline">
              <Link href={`/calls/${call.id}?edit=1`}>
                <Pencil /> Edit
              </Link>
            </Button>
            <ConfirmDeleteDialog
              title="Delete this recruiter call?"
              description="The call, its recordings and its follow-up will be permanently deleted for everyone in this workspace. The linked opportunity is kept."
              confirmLabel="Delete call"
              onConfirm={async () => {
                await deleteCall(call.id);
                toast.success("Call deleted");
                router.push("/calls");
              }}
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              }
            />
          </>
          )
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) => router.replace(v === "overview" ? pathname : `${pathname}?tab=${v}`, { scroll: false })}
      >
        <TabsList aria-label="Call sections">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="intelligence">Interview intelligence</TabsTrigger>
          <TabsTrigger value="recording">
            Recording
            {recordings.length > 0 && <Badge variant="secondary">{recordings.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="notes">Notes & follow-up</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Contact information">
            <dl className="space-y-3 text-sm">
              <Row label="Recruiter" value={recruiter?.name} />
              {recruiter?.agency && <Row label="Agency" value={recruiter.agency} />}
              <Row label="Company" value={company?.name} />
              <Row
                label="Email"
                value={
                  recruiter?.email ? (
                    <a href={`mailto:${recruiter.email}`} className="text-primary hover:underline">
                      {recruiter.email}
                    </a>
                  ) : undefined
                }
              />
              <Row label="Phone" value={recruiter?.phone} />
              <Row label="Call date and time" value={formatDateTime(call.callDateTime)} />
              <Row label="Duration" value={formatDuration(call.durationMinutes)} />
            </dl>
          </Section>
          <Section title="Job opportunity">
            <dl className="space-y-3 text-sm">
              <Row label="Job title" value={opportunity?.title} />
              <Row label="Location" value={opportunity?.location} />
              <Row label="Work arrangement" value={opportunity && WORK_MODE_LABELS[opportunity.workMode]} />
              <Row label="Employment type" value={opportunity && EMPLOYMENT_TYPE_LABELS[opportunity.employmentType]} />
              <Row label="Compensation" value={formatCompensation(opportunity?.compensation)} />
            </dl>
            {opportunity?.jobDescription && (
              <p className="mt-4 border-t pt-4 text-sm whitespace-pre-line">{opportunity.jobDescription}</p>
            )}
          </Section>
          <Section title="Requirements" className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <h3 className="mb-2 text-sm font-medium">Required skills</h3>
                <TagList items={opportunity?.requiredSkills ?? []} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Preferred skills</h3>
                <TagList items={opportunity?.preferredSkills ?? []} variant="outline" />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Hiring manager priorities</h3>
                <BulletList items={call.hiringManagerPriorities} />
              </div>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="intelligence" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Interview process">
            {call.interviewStages.length ? (
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {call.interviewStages.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            ) : (
              <Empty />
            )}
          </Section>
          <Section title="Recruiter advice">
            {call.recruiterAdvice ? <p className="text-sm whitespace-pre-line">{call.recruiterAdvice}</p> : <Empty />}
          </Section>
          <Section title="Technical topics likely to be tested">
            <TagList items={call.technicalTopics} variant="accent" />
          </Section>
          <Section title="Behavioral themes">
            <TagList items={call.behavioralThemes} />
          </Section>
          <Section title="Your questions & recruiter answers" className="lg:col-span-2">
            {call.candidateQuestions.length ? (
              <dl className="divide-y">
                {call.candidateQuestions.map((q) => (
                  <div key={q.id} className="grid grid-cols-1 gap-1 py-3 text-sm first:pt-0 last:pb-0 md:grid-cols-[1fr_2fr] md:gap-4">
                    <dt className="font-medium">{q.question}</dt>
                    <dd className="text-muted-foreground">{q.answer || "No answer recorded"}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <Empty />
            )}
          </Section>
          <Section title="Red flags">
            <BulletList items={call.redFlags} className="marker:text-destructive" />
          </Section>
          <Section title="Interest level">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-semibold tabular-nums">{call.interestLevel}</span>
              <span className="text-sm text-muted-foreground">/ 10</span>
            </div>
            <div
              className="mt-3 grid grid-cols-10 gap-1"
              role="meter"
              aria-label="Interest level"
              aria-valuemin={1}
              aria-valuemax={10}
              aria-valuenow={call.interestLevel}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={`h-2 rounded-full ${i < call.interestLevel ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="recording">
          <Card>
            <CardHeader>
              <CardTitle>Recording attachments</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordingAttachments callId={call.id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Section title="Follow-up">
            {followUp ? (
              <div className="flex items-start gap-3">
                <Checkbox
                  id="call-followup-done"
                  className="mt-0.5"
                  checked={followUp.completed}
                  disabled={!canEdit}
                  onCheckedChange={() => void mutate(() => toggleFollowUp(followUp))}
                />
                <label htmlFor="call-followup-done" className="cursor-pointer text-sm">
                  <span className={followUp.completed ? "text-muted-foreground line-through" : "font-medium"}>
                    {followUp.title}
                  </span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {formatDate(followUp.dueDate)}
                    {!followUp.completed && (
                      <Badge variant={isOverdue(followUp, now) ? "destructive" : "outline"}>
                        {isOverdue(followUp, now) ? "Overdue" : formatRelativeDay(followUp.dueDate, now)}
                      </Badge>
                    )}
                  </span>
                </label>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No next action set.{canEdit ? " Edit the call to add one." : ""}</p>
            )}
          </Section>
          <Section title="Call notes" className="lg:col-span-2">
            {call.notes ? (
              <div className="max-w-prose text-sm leading-relaxed whitespace-pre-line">{call.notes}</div>
            ) : (
              <p className="text-sm text-muted-foreground">No notes yet.</p>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value || "—"}</dd>
    </div>
  );
}

function BulletList({ items, className }: { items: string[]; className?: string }) {
  if (!items.length) return <Empty />;
  return (
    <ul className={`list-disc space-y-1 pl-5 text-sm ${className ?? ""}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">None recorded</p>;
}
