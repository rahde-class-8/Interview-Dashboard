"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Briefcase, CalendarClock, ListTodo, MapPin, PhoneCall, Plus, Search } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useNow } from "@/hooks/use-now";
import { formatCompensation, STAGE_LABELS, WORK_MODE_LABELS } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById, isUpcomingInterview, sortByDateDesc } from "@/lib/store/selectors";
import { cn } from "@/lib/utils";
import { OPPORTUNITY_STAGES, type OpportunityStage } from "@/types";
import { OpportunityFormDialog } from "./opportunity-form-dialog";
import { StageSelect } from "./stage-select";

type StageFilter = OpportunityStage | "all";

export function OpportunitiesPage() {
  const { data } = useAppStore();
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");

  const stageParam = searchParams.get("stage");
  const stage: StageFilter =
    stageParam && (OPPORTUNITY_STAGES as readonly string[]).includes(stageParam)
      ? (stageParam as OpportunityStage)
      : "all";

  const setStage = (next: StageFilter) =>
    router.replace(next === "all" ? pathname : `${pathname}?stage=${next}`, { scroll: false });

  const q = query.trim().toLowerCase();
  const opportunities = sortByDateDesc(data.opportunities, (o) => o.updatedAt).filter((o) => {
    if (stage !== "all" && o.stage !== stage) return false;
    if (!q) return true;
    const company = findById(data.companies, o.companyId)?.name ?? "";
    return [o.title, company, o.location].some((f) => f.toLowerCase().includes(q));
  });

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Every role in your pipeline, from first contact to offer."
        actions={
          <OpportunityFormDialog
            onSaved={(id) => router.push(`/opportunities/${id}`)}
            trigger={
              <Button>
                <Plus /> New opportunity
              </Button>
            }
          />
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div role="group" aria-label="Filter by stage" className="flex flex-wrap gap-1.5">
          {(["all", ...OPPORTUNITY_STAGES] as StageFilter[]).map((s) => {
            const count =
              s === "all" ? data.opportunities.length : data.opportunities.filter((o) => o.stage === s).length;
            const active = stage === s;
            return (
              <Button
                key={s}
                size="sm"
                variant={active ? "default" : "outline"}
                aria-pressed={active}
                onClick={() => setStage(s)}
              >
                {s === "all" ? "All" : STAGE_LABELS[s]}
                <span className={cn("tabular-nums", active ? "opacity-80" : "text-muted-foreground")}>{count}</span>
              </Button>
            );
          })}
        </div>
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search opportunities"
            placeholder="Search by title, company or location"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {opportunities.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No opportunities match"
          description="Try a different stage or search term, or add a new opportunity."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {opportunities.map((o) => {
            const company = findById(data.companies, o.companyId);
            const recruiter = findById(data.recruiters, o.recruiterId);
            const calls = data.calls.filter((c) => c.opportunityId === o.id).length;
            const interviews = data.interviews.filter((i) => i.opportunityId === o.id && isUpcomingInterview(i, now)).length;
            const followUps = data.followUps.filter((f) => f.opportunityId === o.id && !f.completed).length;
            return (
              <li key={o.id}>
                <Card className="h-full">
                  <CardHeader>
                    <p className="text-xs font-medium text-muted-foreground">{company?.name}</p>
                    <Link
                      href={`/opportunities/${o.id}`}
                      className="text-base font-semibold outline-none hover:underline focus-visible:underline"
                    >
                      {o.title}
                    </Link>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-2 text-sm">
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden />
                      {o.location || "Location TBD"} · {WORK_MODE_LABELS[o.workMode]}
                    </p>
                    <p>{formatCompensation(o.compensation)}</p>
                    <p className="text-muted-foreground">Recruiter: {recruiter?.name ?? "—"}</p>
                    <dl className="flex gap-4 pt-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <PhoneCall className="size-3.5" aria-hidden />
                        <dt className="sr-only">Calls</dt>
                        <dd>{calls} calls</dd>
                      </div>
                      <div className="flex items-center gap-1">
                        <CalendarClock className="size-3.5" aria-hidden />
                        <dt className="sr-only">Upcoming interviews</dt>
                        <dd>{interviews} upcoming</dd>
                      </div>
                      <div className="flex items-center gap-1">
                        <ListTodo className="size-3.5" aria-hidden />
                        <dt className="sr-only">Pending follow-ups</dt>
                        <dd>{followUps} follow-ups</dd>
                      </div>
                    </dl>
                  </CardContent>
                  <CardFooter className="justify-between gap-2">
                    <StageSelect opportunity={o} />
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/opportunities/${o.id}`}>Details</Link>
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
