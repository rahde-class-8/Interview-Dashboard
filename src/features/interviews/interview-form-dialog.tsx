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
import { INTERVIEW_FORMAT_LABELS, parseList, STAGE_LABELS, toDateTimeLocalValue } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import { FormError } from "@/components/shared/form-error";
import { useSubmit } from "@/lib/hooks/use-submit";
import type { ID, Interview, InterviewFormat } from "@/types";

const INTERVIEW_STAGES: Interview["stage"][] = ["recruiter_screen", "technical", "hiring_manager", "offer"];

export function InterviewFormDialog({
  interview,
  opportunityId,
  trigger,
}: {
  interview?: Interview;
  opportunityId?: ID;
  trigger: ReactNode;
}) {
  const { data } = useAppStore();
  const { saveInterview } = useActions();
  const [open, setOpen] = useState(false);
  const submit = useSubmit();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState(init);

  function init() {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 1);
    defaultDate.setHours(10, 0, 0, 0);
    return {
      opportunityId: interview?.opportunityId ?? opportunityId ?? data.opportunities[0]?.id ?? "",
      title: interview?.title ?? "",
      stage: interview?.stage ?? ("technical" as Interview["stage"]),
      scheduledAt: toDateTimeLocalValue(interview?.scheduledAt ?? defaultDate.toISOString()),
      durationMinutes: String(interview?.durationMinutes ?? 60),
      format: interview?.format ?? ("video" as InterviewFormat),
      interviewers: interview?.interviewers.join(", ") ?? "",
      notes: interview?.notes ?? "",
    };
  }

  const set = (key: keyof ReturnType<typeof init>, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!values.opportunityId) next.opportunityId = "Choose an opportunity.";
    if (!values.title.trim()) next.title = "Title is required.";
    if (!values.scheduledAt) next.scheduledAt = "Date and time are required.";
    const duration = Number(values.durationMinutes);
    if (!Number.isFinite(duration) || duration <= 0) next.durationMinutes = "Enter a positive number of minutes.";
    setErrors(next);
    if (Object.keys(next).length) return;

    const fields = {
      title: values.title.trim(),
      stage: values.stage,
      scheduledAt: new Date(values.scheduledAt).toISOString(),
      durationMinutes: duration,
      format: values.format,
      interviewers: parseList(values.interviewers),
      notes: values.notes,
    };
    const saved = await submit.run(
      () => (interview ? saveInterview(fields, interview.id) : saveInterview({ ...fields, opportunityId: values.opportunityId })),
      { success: interview ? "Interview saved" : "Interview scheduled" },
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
          <DialogTitle>{interview ? "Edit interview" : "Schedule interview"}</DialogTitle>
          <DialogDescription>Track an interview you have scheduled. This does not create a calendar event.</DialogDescription>
        </DialogHeader>
        <form id="interview-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {!opportunityId && (
            <Field id="int-opp" label="Opportunity" required error={errors.opportunityId} className="sm:col-span-2">
              <Select value={values.opportunityId} onValueChange={(v) => set("opportunityId", v)}>
                <SelectTrigger {...fieldAria("int-opp", errors.opportunityId)} className="w-full">
                  <SelectValue placeholder="Choose an opportunity" />
                </SelectTrigger>
                <SelectContent>
                  {data.opportunities.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {findById(data.companies, o.companyId)?.name} — {o.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field id="int-title" label="Title" required error={errors.title} className="sm:col-span-2">
            <Input {...fieldAria("int-title", errors.title)} placeholder="e.g. System design round" value={values.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field id="int-stage" label="Interview stage">
            <Select value={values.stage} onValueChange={(v) => set("stage", v)}>
              <SelectTrigger id="int-stage" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVIEW_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="int-format" label="Format">
            <Select value={values.format} onValueChange={(v) => set("format", v)}>
              <SelectTrigger id="int-format" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INTERVIEW_FORMAT_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="int-when" label="Date and time" required error={errors.scheduledAt}>
            <Input {...fieldAria("int-when", errors.scheduledAt)} type="datetime-local" value={values.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} />
          </Field>
          <Field id="int-duration" label="Duration (minutes)" error={errors.durationMinutes}>
            <Input {...fieldAria("int-duration", errors.durationMinutes)} type="number" min={1} value={values.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} />
          </Field>
          <Field id="int-interviewers" label="Interviewers" hint="Comma-separated" className="sm:col-span-2">
            <Input {...fieldAria("int-interviewers", undefined, "hint")} value={values.interviewers} onChange={(e) => set("interviewers", e.target.value)} />
          </Field>
          <Field id="int-notes" label="Notes" className="sm:col-span-2">
            <Textarea id="int-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </form>
        <FormError message={submit.error} />
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="interview-form" disabled={submit.pending}>
            {submit.pending ? "Saving…" : interview ? "Save changes" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
