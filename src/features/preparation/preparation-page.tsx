"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpenCheck, Briefcase, Pencil, Plus, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StageBadge } from "@/components/shared/stage-badge";
import { TagList } from "@/components/shared/tag-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { InterviewList } from "@/features/interviews/interview-list";
import { useNow } from "@/hooks/use-now";
import { formatDate } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import {
  findById,
  getOpportunityIntel,
  getUpcomingInterviews,
  isActiveOpportunity,
} from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import type { Opportunity, StarStory } from "@/types";
import { PrepTaskList } from "./prep-task-list";
import { StarStoryDialog } from "./star-story-dialog";

export function PreparationPage() {
  const { data } = useAppStore();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const active = data.opportunities.filter(isActiveOpportunity);
  const requested = findById(data.opportunities, searchParams.get("opportunity") ?? undefined);
  const opportunity = requested ?? active[0] ?? data.opportunities[0];

  if (!opportunity) {
    return (
      <>
        <PageHeader title="Interview Preparation" />
        <EmptyState
          icon={Briefcase}
          title="No opportunities to prepare for"
          description="Create an opportunity to start a preparation workspace."
          action={
            <Button asChild>
              <Link href="/opportunities">Go to opportunities</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Interview Preparation"
        description="Everything you learned from recruiters, turned into a plan."
        actions={
          <Select
            value={opportunity.id}
            onValueChange={(id) => router.replace(`${pathname}?opportunity=${id}`, { scroll: false })}
          >
            <SelectTrigger className="w-full sm:w-80" aria-label="Choose opportunity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.opportunities.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {findById(data.companies, o.companyId)?.name} — {o.title}
                  {o.stage === "closed" ? " (closed)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <Workspace key={opportunity.id} opportunity={opportunity} />
    </>
  );
}

function Workspace({ opportunity }: { opportunity: Opportunity }) {
  const { data } = useAppStore();
  const now = useNow();
  const company = findById(data.companies, opportunity.companyId);
  const intel = getOpportunityIntel(data, opportunity.id);
  const tasks = data.preparationTasks.filter((t) => t.opportunityId === opportunity.id);
  const interviews = getUpcomingInterviews(data, now).filter((i) => i.opportunityId === opportunity.id);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link href={`/opportunities/${opportunity.id}`} className="font-medium text-primary hover:underline">
            {company?.name} — {opportunity.title}
          </Link>
          <StageBadge stage={opportunity.stage} />
        </div>

        <Tabs defaultValue="checklist">
          <TabsList aria-label="Preparation sections">
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="technical">Technical</TabsTrigger>
            <TabsTrigger value="behavioral">Behavioral & STAR</TabsTrigger>
            <TabsTrigger value="notes">Interview notes</TabsTrigger>
          </TabsList>

          <TabsContent value="checklist">
            <Card>
              <CardHeader>
                <CardTitle>Preparation checklist</CardTitle>
                <CardDescription>Add, edit and check off tasks for this opportunity</CardDescription>
              </CardHeader>
              <CardContent>
                <PrepTaskList tasks={tasks} opportunityId={opportunity.id} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="technical" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Technical topics</CardTitle>
                <CardDescription>Topics recruiters said are likely to be tested</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <TagList items={intel.technicalTopics} variant="accent" empty="No topics recorded in recruiter calls yet." />
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
            <RelatedQuestions topics={[...intel.technicalTopics, ...opportunity.requiredSkills]} companyId={opportunity.companyId} />
          </TabsContent>

          <TabsContent value="behavioral" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Behavioral themes</CardTitle>
                <CardDescription>What the recruiter said they will probe for</CardDescription>
              </CardHeader>
              <CardContent>
                <TagList items={intel.behavioralThemes} empty="No behavioral themes recorded yet." />
              </CardContent>
            </Card>
            <StarStories />
          </TabsContent>

          <TabsContent value="notes">
            <InterviewNotes opportunity={opportunity} />
          </TabsContent>
        </Tabs>
      </div>

      <aside className="space-y-6" aria-label="Recruiter intelligence">
        <Card>
          <CardHeader>
            <CardTitle>Recruiter advice</CardTitle>
            <CardDescription>From {intel.calls.length} call(s)</CardDescription>
          </CardHeader>
          <CardContent>
            {intel.advice.length ? (
              <ul className="space-y-4">
                {intel.advice.map((a) => (
                  <li key={a.callId} className="text-sm">
                    <p className="whitespace-pre-line">{a.text}</p>
                    <Link href={`/calls/${a.callId}`} className="mt-1 inline-block text-xs text-primary hover:underline">
                      Call on {formatDate(a.date)}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No advice recorded yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Hiring manager priorities</CardTitle>
          </CardHeader>
          <CardContent>
            {intel.hiringManagerPriorities.length ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {intel.hiringManagerPriorities.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None recorded</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming interviews</CardTitle>
          </CardHeader>
          <CardContent>
            <InterviewList interviews={interviews} emptyTitle="Nothing scheduled" />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function InterviewNotes({ opportunity }: { opportunity: Opportunity }) {
  const { updateOpportunity } = useActions();
  const [draft, setDraft] = useState(opportunity.prepNotes);
  const dirty = draft !== opportunity.prepNotes;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interview notes</CardTitle>
        <CardDescription>Your own notes for this opportunity&apos;s interviews</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label htmlFor="prep-notes" className="sr-only">
          Interview notes
        </label>
        <Textarea id="prep-notes" rows={10} value={draft} onChange={(e) => setDraft(e.target.value)} />
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {dirty ? "Unsaved changes" : "Saved in this session"}
          </span>
          <Button variant="outline" disabled={!dirty} onClick={() => setDraft(opportunity.prepNotes)}>
            Discard
          </Button>
          <Button disabled={!dirty} onClick={() => updateOpportunity(opportunity.id, { prepNotes: draft })}>
            Save notes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StarStories() {
  const { data } = useAppStore();
  const { deleteStarStory } = useActions();

  return (
    <Card>
      <CardHeader>
        <CardTitle>STAR stories</CardTitle>
        <CardDescription>Reusable across every opportunity</CardDescription>
        <CardAction>
          <StarStoryDialog
            trigger={
              <Button size="sm" variant="outline">
                <Plus /> New story
              </Button>
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {data.starStories.length === 0 ? (
          <EmptyState title="No STAR stories yet" />
        ) : (
          <ul className="space-y-3">
            {data.starStories.map((story) => (
              <StarStoryCard key={story.id} story={story} onDelete={() => deleteStarStory(story.id)} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function StarStoryCard({ story, onDelete }: { story: StarStory; onDelete: () => void }) {
  return (
    <li className="rounded-lg border">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <span className="min-w-0">
            <span className="block text-sm font-medium">{story.title}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {story.themes.map((t) => (
                <Badge key={t} variant="secondary">{t}</Badge>
              ))}
            </span>
          </span>
          <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <div className="space-y-3 border-t px-3 py-3">
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            {(["situation", "task", "action", "result"] as const).map((k) => (
              <div key={k}>
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{k}</dt>
                <dd>{story[k] || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="flex gap-2">
            <StarStoryDialog
              story={story}
              trigger={
                <Button size="sm" variant="outline">
                  <Pencil /> Edit
                </Button>
              }
            />
            <ConfirmDeleteDialog
              title="Delete STAR story?"
              description={`“${story.title}” will be removed from this prototype session.`}
              onConfirm={onDelete}
              trigger={
                <Button size="sm" variant="ghost" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              }
            />
          </div>
        </div>
      </details>
    </li>
  );
}

function RelatedQuestions({ topics, companyId }: { topics: string[]; companyId: string }) {
  const { data } = useAppStore();
  const lower = topics.map((t) => t.toLowerCase());
  const questions = data.questions
    .filter(
      (q) =>
        q.type === "technical" &&
        (q.companyId === companyId || lower.some((t) => t.includes(q.topic.toLowerCase()) || q.topic.toLowerCase().includes(t))),
    )
    .slice(0, 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice questions</CardTitle>
        <CardDescription>From your question bank, matched to these topics</CardDescription>
        <CardAction>
          <Button asChild size="sm" variant="ghost">
            <Link href="/questions">Question bank</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {questions.length === 0 ? (
          <EmptyState icon={BookOpenCheck} title="No matching questions" />
        ) : (
          <ul className="divide-y">
            {questions.map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <span>{q.question}</span>
                <span className="flex shrink-0 gap-1">
                  {q.companyId === companyId && <Badge variant="accent">Company</Badge>}
                  <Badge variant="outline">{q.topic}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
