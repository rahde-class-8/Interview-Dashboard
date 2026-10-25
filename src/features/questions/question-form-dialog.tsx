"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Field, fieldAria } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/lib/store/app-store";
import { useActions } from "@/lib/store/use-actions";
import { FormError } from "@/components/shared/form-error";
import { useSubmit } from "@/lib/hooks/use-submit";
import type { InterviewQuestion, QuestionDifficulty, QuestionType } from "@/types";

const GENERAL = "__general";

export function QuestionFormDialog({ question, trigger }: { question?: InterviewQuestion; trigger: ReactNode }) {
  const { data } = useAppStore();
  const { saveQuestion } = useActions();
  const [open, setOpen] = useState(false);
  const submit = useSubmit();
  const [values, setValues] = useState(init);
  const [errors, setErrors] = useState<{ question?: string; topic?: string }>({});

  function init() {
    return {
      question: question?.question ?? "",
      type: question?.type ?? ("technical" as QuestionType),
      topic: question?.topic ?? "",
      companyId: question?.companyId ?? GENERAL,
      difficulty: question?.difficulty ?? ("medium" as QuestionDifficulty),
      answerNotes: question?.answerNotes ?? "",
    };
  }

  const topics = [...new Set(data.questions.map((q) => q.topic))].sort();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!values.question.trim()) next.question = "Enter the question.";
    if (!values.topic.trim()) next.topic = "Enter a topic or category.";
    setErrors(next);
    if (Object.keys(next).length) return;
    const saved = await submit.run(
      () =>
        saveQuestion(
          {
            question: values.question.trim(),
            type: values.type,
            topic: values.topic.trim(),
            companyId: values.companyId === GENERAL ? null : values.companyId,
            difficulty: values.difficulty,
            answerNotes: values.answerNotes,
          },
          question?.id,
        ),
      { success: question ? "Question saved" : "Question added" },
    );
    if (saved) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          submit.reset();
          setValues(init());
          setErrors({});
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{question ? "Edit question" : "Add question"}</DialogTitle>
          <DialogDescription>Save a question you were asked or want to practise.</DialogDescription>
        </DialogHeader>
        <form id="question-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="qf-question" label="Question" required error={errors.question} className="sm:col-span-2">
            <Textarea {...fieldAria("qf-question", errors.question)} rows={3} value={values.question} onChange={(e) => setValues((v) => ({ ...v, question: e.target.value }))} />
          </Field>
          <Field id="qf-type" label="Type">
            <Select value={values.type} onValueChange={(t) => setValues((v) => ({ ...v, type: t as QuestionType }))}>
              <SelectTrigger id="qf-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="behavioral">Behavioral</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="qf-topic" label="Topic / category" required error={errors.topic}>
            <Input {...fieldAria("qf-topic", errors.topic)} list="qf-topic-options" value={values.topic} onChange={(e) => setValues((v) => ({ ...v, topic: e.target.value }))} />
            <datalist id="qf-topic-options">
              {topics.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field id="qf-company" label="Company">
            <Select value={values.companyId} onValueChange={(c) => setValues((v) => ({ ...v, companyId: c }))}>
              <SelectTrigger id="qf-company" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GENERAL}>General (not company-specific)</SelectItem>
                {data.companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="qf-difficulty" label="Difficulty">
            <Select value={values.difficulty} onValueChange={(d) => setValues((v) => ({ ...v, difficulty: d as QuestionDifficulty }))}>
              <SelectTrigger id="qf-difficulty" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="qf-answer" label="Personal answer notes" className="sm:col-span-2">
            <Textarea id="qf-answer" rows={4} value={values.answerNotes} onChange={(e) => setValues((v) => ({ ...v, answerNotes: e.target.value }))} />
          </Field>
        </form>
        <FormError message={submit.error} />
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="question-form" disabled={submit.pending}>
            {submit.pending ? "Saving…" : question ? "Save question" : "Add question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
