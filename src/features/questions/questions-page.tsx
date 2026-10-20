"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpenCheck, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store/app-store";
import { findById } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import type { InterviewQuestion, QuestionDifficulty } from "@/types";
import { QuestionFormDialog } from "./question-form-dialog";

const ALL = "all";
const GENERAL = "general";

const DIFFICULTY_VARIANT: Record<QuestionDifficulty, "success" | "warning" | "destructive"> = {
  easy: "success",
  medium: "warning",
  hard: "destructive",
};

export function QuestionsPage() {
  const { data } = useAppStore();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [type, setType] = useState(ALL);
  const [topic, setTopic] = useState(ALL);
  const [company, setCompany] = useState(ALL);

  const topics = [...new Set(data.questions.map((q) => q.topic))].sort();
  const q = query.trim().toLowerCase();
  const questions = data.questions.filter((item) => {
    if (type !== ALL && item.type !== type) return false;
    if (topic !== ALL && item.topic !== topic) return false;
    if (company === GENERAL && item.companyId) return false;
    if (company !== ALL && company !== GENERAL && item.companyId !== company) return false;
    if (!q) return true;
    return [item.question, item.topic, item.answerNotes].some((f) => f.toLowerCase().includes(q));
  });
  const filtersActive = q || type !== ALL || topic !== ALL || company !== ALL;

  return (
    <>
      <PageHeader
        title="Question Bank"
        description="Technical, behavioral and company-specific questions with your answer notes."
        actions={
          <QuestionFormDialog
            trigger={
              <Button>
                <Plus /> Add question
              </Button>
            }
          />
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search questions"
            placeholder="Search questions and answer notes"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-full" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            <SelectItem value="technical">Technical</SelectItem>
            <SelectItem value="behavioral">Behavioral</SelectItem>
          </SelectContent>
        </Select>
        <Select value={topic} onValueChange={setTopic}>
          <SelectTrigger className="w-full" aria-label="Filter by topic">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All topics</SelectItem>
            {topics.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={company} onValueChange={setCompany}>
          <SelectTrigger className="w-full" aria-label="Filter by company">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All companies</SelectItem>
            <SelectItem value={GENERAL}>General only</SelectItem>
            {data.companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mb-3 flex items-center justify-between text-sm text-muted-foreground">
        <span aria-live="polite">
          {questions.length} of {data.questions.length} questions
        </span>
        {filtersActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQuery("");
              setType(ALL);
              setTopic(ALL);
              setCompany(ALL);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {questions.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="No questions match" description="Adjust the filters or add a new question." />
      ) : (
        <ul className="space-y-3">
          {questions.map((item) => (
            <QuestionCard key={item.id} question={item} />
          ))}
        </ul>
      )}
    </>
  );
}

function QuestionCard({ question }: { question: InterviewQuestion }) {
  const { data } = useAppStore();
  const { saveQuestion, deleteQuestion } = useActions();
  const company = findById(data.companies, question.companyId);
  const [draft, setDraft] = useState(question.answerNotes);
  // Keep the draft in sync when notes change elsewhere (e.g. the edit dialog).
  const [savedNotes, setSavedNotes] = useState(question.answerNotes);
  if (savedNotes !== question.answerNotes) {
    setSavedNotes(question.answerNotes);
    setDraft(question.answerNotes);
  }
  const dirty = draft !== question.answerNotes;
  const notesId = `answer-${question.id}`;

  return (
    <li>
      <Card className="gap-3 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <p className="font-medium">{question.question}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={question.type === "technical" ? "accent" : "secondary"}>
                {question.type === "technical" ? "Technical" : "Behavioral"}
              </Badge>
              <Badge variant="outline">{question.topic}</Badge>
              <Badge variant={DIFFICULTY_VARIANT[question.difficulty]} className="capitalize">
                {question.difficulty}
              </Badge>
              {company && <Badge variant="outline">{company.name}</Badge>}
            </div>
          </div>
          <div className="flex shrink-0">
            <QuestionFormDialog
              question={question}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="Edit question">
                  <Pencil />
                </Button>
              }
            />
            <ConfirmDeleteDialog
              title="Delete question?"
              description="This question and your answer notes will be removed from this prototype session."
              onConfirm={() => deleteQuestion(question.id)}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="Delete question">
                  <Trash2 />
                </Button>
              }
            />
          </div>
        </div>
        <details className="group rounded-md border bg-muted/30">
          <summary className="cursor-pointer rounded-md px-3 py-2 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {question.answerNotes ? "Your answer notes" : "Add answer notes"}
          </summary>
          <div className="space-y-2 px-3 pb-3">
            <label htmlFor={notesId} className="sr-only">
              Personal answer notes
            </label>
            <Textarea id={notesId} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => setDraft(question.answerNotes)}>
                Discard
              </Button>
              <Button size="sm" disabled={!dirty} onClick={() => saveQuestion({ ...question, answerNotes: draft })}>
                Save notes
              </Button>
            </div>
          </div>
        </details>
      </Card>
    </li>
  );
}
