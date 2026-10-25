"use client";

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CalendarClock,
  ListTodo,
  Paperclip,
  PhoneCall,
  type LucideIcon,
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { PrototypeNotice } from "@/components/shared/prototype-notice";
import { StageBadge } from "@/components/shared/stage-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useNow } from "@/hooks/use-now";
import { formatDate, formatDuration, formatRelativeDay, STAGE_LABELS } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import {
  findById,
  getCallRows,
  getDashboardMetrics,
  getSkillFrequency,
  sortByDateAsc,
} from "@/lib/store/selectors";
import { useMutation } from "@/lib/hooks/use-submit";
import { ROLE_LABELS, usePermissions } from "@/lib/store/permissions";
import { useActions } from "@/lib/store/use-actions";
import { cn } from "@/lib/utils";
import { OPPORTUNITY_STAGES } from "@/types";

export function OverviewPage() {
  const { data } = useAppStore();
  const now = useNow();
  const metrics = getDashboardMetrics(data, now);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${data.currentUser.name.split(" ")[0]}`}
        description="Your recruiter conversations, pipeline and preparation at a glance."
      />
      {data.workspace.role !== "owner" && (
        <PrototypeNotice className="mb-6">
          You&apos;re viewing the shared workspace “{data.workspace.name}” as {ROLE_LABELS[data.workspace.role].toLowerCase()}.
          {data.workspace.role === "viewer" || data.workspace.role === "commenter" ? " Editing is limited to editors and the owner." : ""}
        </PrototypeNotice>
      )}

      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total recruiter calls" value={metrics.totalCalls} icon={PhoneCall} href="/calls" />
        <MetricCard
          label="Active opportunities"
          value={metrics.activeOpportunities}
          icon={Briefcase}
          href="/opportunities"
        />
        <MetricCard
          label="Upcoming interviews"
          value={metrics.upcomingInterviews}
          icon={CalendarClock}
          href="/interviews"
        />
        <MetricCard
          label="Pending follow-ups"
          value={metrics.pendingFollowUps}
          icon={ListTodo}
          href="/interviews#follow-ups"
          hint={metrics.overdueFollowUps ? `${metrics.overdueFollowUps} overdue` : undefined}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RecentCalls className="lg:col-span-2" />
        <Pipeline />
        <PrepTasks className="lg:col-span-2" />
        <SkillFrequency />
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  href,
  hint,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <Card className="h-full gap-2 transition-colors group-hover:border-primary/40">
        <CardHeader>
          <CardDescription>{label}</CardDescription>
          <CardAction>
            <Icon className="size-4 text-muted-foreground" aria-hidden />
          </CardAction>
        </CardHeader>
        <CardContent className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{value}</span>
          {hint && <span className="text-xs font-medium text-destructive">{hint}</span>}
        </CardContent>
      </Card>
    </Link>
  );
}

function RecentCalls({ className }: { className?: string }) {
  const { data } = useAppStore();
  const rows = getCallRows(data).slice(0, 5);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Recent recruiter calls</CardTitle>
        <CardDescription>Your latest conversations</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/calls">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={PhoneCall}
            title="No recruiter calls yet"
            action={
              <Button asChild size="sm">
                <Link href="/calls/new">Log a call</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.call.id}>
                <Link
                  href={`/calls/${row.call.id}`}
                  className="-mx-2 flex flex-col gap-1 rounded-md px-2 py-3 outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {row.recruiterName} · {row.companyName}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">{row.jobTitle}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {row.recordingCount > 0 && (
                      <Paperclip className="size-3.5" aria-label="Has recording" />
                    )}
                    {formatDate(row.call.callDateTime)} · {formatDuration(row.call.durationMinutes)}
                    {row.opportunity && <StageBadge stage={row.opportunity.stage} />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Pipeline() {
  const { data } = useAppStore();
  const total = data.opportunities.length || 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opportunity pipeline</CardTitle>
        <CardDescription>{data.opportunities.length} opportunities by stage</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {OPPORTUNITY_STAGES.map((stage) => {
            const count = data.opportunities.filter((o) => o.stage === stage).length;
            return (
              <li key={stage}>
                <Link
                  href={`/opportunities?stage=${stage}`}
                  className="block rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{STAGE_LABELS[stage]}</span>
                    <span className="font-medium tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                    <div
                      className={cn("h-full rounded-full", stage === "closed" ? "bg-muted-foreground/40" : "bg-primary")}
                      style={{ width: `${(count / total) * 100}%` }}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function PrepTasks({ className }: { className?: string }) {
  const { data } = useAppStore();
  const { togglePrepTask } = useActions();
  const { canEdit } = usePermissions();
  const mutate = useMutation();
  const now = useNow();
  const tasks = sortByDateAsc(
    data.preparationTasks.filter((t) => !t.completed),
    (t) => t.dueDate ?? "9999-12-31",
  ).slice(0, 6);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Upcoming preparation tasks</CardTitle>
        <CardDescription>Check off tasks as you finish them</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/preparation">
              Open prep <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <EmptyState icon={ListTodo} title="All preparation tasks are complete" />
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => {
              const opp = findById(data.opportunities, task.opportunityId);
              const company = findById(data.companies, opp?.companyId);
              const checkboxId = `dash-prep-${task.id}`;
              return (
                <li key={task.id} className="flex items-start gap-3 py-2.5">
                  <Checkbox
                    id={checkboxId}
                    className="mt-0.5"
                    checked={task.completed}
                    disabled={!canEdit}
                    onCheckedChange={() => void mutate(() => togglePrepTask(task), "Task completed")}
                  />
                  <label htmlFor={checkboxId} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block text-sm">{task.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {company?.name} · {opp?.title}
                    </span>
                  </label>
                  {task.dueDate && (
                    <Badge variant={new Date(task.dueDate) < now ? "destructive" : "outline"}>
                      {formatRelativeDay(task.dueDate, now)}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SkillFrequency() {
  const { data } = useAppStore();
  const skills = getSkillFrequency(data);
  const max = skills[0]?.count ?? 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Frequently mentioned skills</CardTitle>
        <CardDescription>From call topics and job requirements</CardDescription>
      </CardHeader>
      <CardContent>
        {skills.length === 0 ? (
          <EmptyState title="No skills recorded yet" />
        ) : (
          <ol className="space-y-2.5">
            {skills.map((s) => (
              <li key={s.label} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{s.label}</span>
                <span className="h-1.5 rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-primary/70" style={{ width: `${(s.count / max) * 100}%` }} />
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {s.count}
                  <span className="sr-only"> mentions</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
