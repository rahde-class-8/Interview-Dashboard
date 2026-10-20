"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNow } from "@/hooks/use-now";
import { useAppStore } from "@/lib/store/app-store";
import { getUpcomingInterviews, isOverdue, isUpcomingInterview, sortByDateDesc } from "@/lib/store/selectors";
import { FollowUpList } from "./follow-up-list";
import { InterviewFormDialog } from "./interview-form-dialog";
import { InterviewList } from "./interview-list";

type FollowUpFilter = "pending" | "completed" | "all";

export function InterviewsPage() {
  const { data } = useAppStore();
  const now = useNow();
  const [filter, setFilter] = useState<FollowUpFilter>("pending");

  const upcoming = getUpcomingInterviews(data, now);
  const other = sortByDateDesc(
    data.interviews.filter((i) => !isUpcomingInterview(i, now)),
    (i) => i.scheduledAt,
  );
  const followUps = data.followUps.filter((f) =>
    filter === "all" ? true : filter === "completed" ? f.completed : !f.completed,
  );
  const pendingCount = data.followUps.filter((f) => !f.completed).length;
  const completedCount = data.followUps.length - pendingCount;
  const overdueCount = data.followUps.filter((f) => isOverdue(f, now)).length;

  return (
    <>
      <PageHeader
        title="Interviews & Follow-ups"
        description="Scheduled interviews, outcomes, and the follow-ups that keep things moving."
        actions={
          <InterviewFormDialog
            trigger={
              <Button>
                <Plus /> Schedule interview
              </Button>
            }
          />
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Upcoming interviews" value={upcoming.length} />
        <Stat label="Past & other interviews" value={other.length} />
        <Stat label="Pending follow-ups" value={pendingCount} />
        <Stat label="Overdue follow-ups" value={overdueCount} tone={overdueCount ? "danger" : undefined} />
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming interviews</CardTitle>
            <CardDescription>Update status and outcome as things happen</CardDescription>
          </CardHeader>
          <CardContent>
            <InterviewList interviews={upcoming} showOpportunity emptyTitle="No upcoming interviews" />
          </CardContent>
        </Card>

        <Card id="follow-ups" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>Follow-up tasks</CardTitle>
            <CardDescription>
              {pendingCount} pending · {completedCount} completed
            </CardDescription>
            <CardAction>
              <Tabs value={filter} onValueChange={(v) => setFilter(v as FollowUpFilter)}>
                <TabsList aria-label="Filter follow-ups">
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="completed">Completed</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>
          <CardContent>
            <FollowUpList tasks={followUps} showOpportunity />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Past & other interviews</CardTitle>
            <CardDescription>Completed, cancelled, rescheduled or past-due interviews</CardDescription>
          </CardHeader>
          <CardContent>
            <InterviewList interviews={other} showOpportunity emptyTitle="No past interviews" />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "danger" }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`text-2xl font-semibold tabular-nums ${tone === "danger" ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  );
}
