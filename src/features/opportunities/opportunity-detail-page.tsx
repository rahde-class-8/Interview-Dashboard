"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Paperclip, Pencil, PhoneCall, Plus, SearchX, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { TagList } from "@/components/shared/tag-list";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { FollowUpList } from "@/features/interviews/follow-up-list";
import { InterviewFormDialog } from "@/features/interviews/interview-form-dialog";
import { InterviewList } from "@/features/interviews/interview-list";
import {
  EMPLOYMENT_TYPE_LABELS,
  formatCompensation,
  formatDate,
  formatDuration,
  WORK_MODE_LABELS,
} from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById, getCallRecordings, getOpportunityIntel, sortByDateAsc } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import type { ID } from "@/types";
import { OpportunityFormDialog } from "./opportunity-form-dialog";
import { StageStepper } from "./stage-stepper";

export function OpportunityDetailPage({ opportunityId }: { opportunityId: ID }) {
  const { data } = useAppStore();
  const { deleteOpportunity } = useActions();
  const router = useRouter();
  const opportunity = findById(data.opportunities, opportunityId);

  if (!opportunity) {
    return (
      <EmptyState
        icon={SearchX}
        title="Opportunity not found"
        description="It may have been deleted in this session, or the link is incorrect."
        action={
          <Button asChild>
            <Link href="/opportunities">Back to opportunities</Link>
          </Button>
        }
      />
    );
  }

  const company = findById(data.companies, opportunity.companyId);
  const recruiter = findById(data.recruiters, opportunity.recruiterId);
  const intel = getOpportunityIntel(data, opportunity.id);
  const interviews = sortByDateAsc(
    data.interviews.filter((i) => i.opportunityId === opportunity.id),
    (i) => i.scheduledAt,
  );
  const followUps = data.followUps.filter((f) => f.opportunityId === opportunity.id);
  const prepTasks = data.preparationTasks.filter((t) => t.opportunityId === opportunity.id);
  const prepDone = prepTasks.filter((t) => t.completed).length;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/opportunities">
          <ArrowLeft /> Opportunities
        </Link>
      </Button>
      <PageHeader
        title={opportunity.title}
        description={`${company?.name ?? "Unknown company"} · ${opportunity.location || "Location TBD"}`}
        actions={
          <>
            <OpportunityFormDialog
              opportunity={opportunity}
              trigger={
                <Button variant="outline">
                  <Pencil /> Edit
                </Button>
              }
            />
            <ConfirmDeleteDialog
              title="Delete this opportunity?"
              description="This also removes its recruiter calls, recordings, interviews, follow-ups and preparation tasks from this prototype session."
              onConfirm={() => {
                deleteOpportunity(opportunity.id);
                router.push("/opportunities");
              }}
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              }
            />
          </>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Pipeline stage</CardTitle>
          <CardDescription>Select a stage to move this opportunity</CardDescription>
        </CardHeader>
        <CardContent>
          <StageStepper opportunity={opportunity} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Role</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm whitespace-pre-line">
                {opportunity.jobDescription || <span className="text-muted-foreground">No job description yet.</span>}
              </p>
              <div>
                <h3 className="mb-2 text-sm font-medium">Required skills</h3>
                <TagList items={opportunity.requiredSkills} />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Preferred skills</h3>
                <TagList items={opportunity.preferredSkills} variant="outline" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recruiter intelligence</CardTitle>
              <CardDescription>Combined from {intel.calls.length} recruiter call(s)</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium">Technical topics</h3>
                <TagList items={intel.technicalTopics} variant="accent" />
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Behavioral themes</h3>
                <TagList items={intel.behavioralThemes} />
              </div>
              <div className="sm:col-span-2">
                <h3 className="mb-2 text-sm font-medium">Hiring manager priorities</h3>
                {intel.hiringManagerPriorities.length ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {intel.hiringManagerPriorities.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">None recorded</p>
                )}
              </div>
              {intel.redFlags.length > 0 && (
                <div className="sm:col-span-2">
                  <h3 className="mb-2 text-sm font-medium">Red flags</h3>
                  <TagList items={intel.redFlags} variant="destructive" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recruiter calls</CardTitle>
              <CardAction>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/calls/new?opportunityId=${opportunity.id}`}>
                    <Plus /> Log call
                  </Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              {intel.calls.length === 0 ? (
                <EmptyState icon={PhoneCall} title="No calls logged for this opportunity" />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {intel.calls.map((call) => {
                    const r = findById(data.recruiters, call.recruiterId);
                    const recordings = getCallRecordings(data, call.id).length;
                    return (
                      <li key={call.id}>
                        <Link
                          href={`/calls/${call.id}`}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm outline-none hover:bg-muted/60 focus-visible:bg-muted"
                        >
                          <span>
                            <span className="font-medium">{r?.name}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · {formatDate(call.callDateTime)} · {formatDuration(call.durationMinutes)}
                            </span>
                          </span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {recordings > 0 && <Paperclip className="size-3.5" aria-label="Has recording" />}
                            Interest {call.interestLevel}/10
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interviews</CardTitle>
              <CardAction>
                <InterviewFormDialog
                  opportunityId={opportunity.id}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Plus /> Schedule
                    </Button>
                  }
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <InterviewList interviews={interviews} emptyTitle="No interviews scheduled" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Follow-up tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <FollowUpList tasks={followUps} opportunityId={opportunity.id} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3 text-sm">
                <DetailRow label="Company" value={company?.name} />
                <DetailRow label="Industry" value={company?.industry} />
                <DetailRow label="Location" value={opportunity.location || "—"} />
                <DetailRow label="Work arrangement" value={WORK_MODE_LABELS[opportunity.workMode]} />
                <DetailRow label="Employment type" value={EMPLOYMENT_TYPE_LABELS[opportunity.employmentType]} />
                <DetailRow label="Compensation" value={formatCompensation(opportunity.compensation)} />
                <DetailRow label="Last updated" value={formatDate(opportunity.updatedAt)} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recruiter</CardTitle>
            </CardHeader>
            <CardContent>
              {recruiter ? (
                <dl className="space-y-3 text-sm">
                  <DetailRow label="Name" value={recruiter.name} />
                  {recruiter.agency && <DetailRow label="Agency" value={recruiter.agency} />}
                  <DetailRow
                    label="Email"
                    value={recruiter.email ? <a className="text-primary hover:underline" href={`mailto:${recruiter.email}`}>{recruiter.email}</a> : "—"}
                  />
                  <DetailRow label="Phone" value={recruiter.phone || "—"} />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">No recruiter linked.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Interview preparation</CardTitle>
              <CardDescription>
                {prepDone} of {prepTasks.length} tasks complete
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Progress
                value={prepTasks.length ? (prepDone / prepTasks.length) * 100 : 0}
                aria-label="Preparation progress"
              />
              <Button asChild variant="outline" className="w-full">
                <Link href={`/preparation?opportunity=${opportunity.id}`}>
                  Open preparation workspace <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value ?? "—"}</dd>
    </div>
  );
}
