"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, X } from "lucide-react";

import { Field, fieldAria } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createId } from "@/lib/id";
import {
  EMPLOYMENT_TYPE_LABELS,
  parseLines,
  parseList,
  toDateInputValue,
  toDateTimeLocalValue,
  WORK_MODE_LABELS,
} from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById, getCallFollowUp } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import { FormError } from "@/components/shared/form-error";
import { useSubmit } from "@/lib/hooks/use-submit";
import type { AppData, CandidateQuestion, EmploymentType, ID, RecruiterCall, WorkMode } from "@/types";

const NEW = "__new";
const NONE = "__none";

type TabId = "contact" | "job" | "requirements" | "intelligence" | "followup";

const TABS: { id: TabId; label: string }[] = [
  { id: "contact", label: "Contact" },
  { id: "job", label: "Job opportunity" },
  { id: "requirements", label: "Requirements" },
  { id: "intelligence", label: "Interview intelligence" },
  { id: "followup", label: "Follow-up & notes" },
];

export interface CallFormValues {
  opportunityId: string;
  recruiterId: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string;
  recruiterAgency: string;
  companyName: string;
  callDateTime: string;
  durationMinutes: string;
  jobTitle: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  compMin: string;
  compMax: string;
  compPeriod: "year" | "hour";
  jobDescription: string;
  requiredSkills: string;
  preferredSkills: string;
  hiringManagerPriorities: string;
  interviewStages: string;
  recruiterAdvice: string;
  technicalTopics: string;
  behavioralThemes: string;
  candidateQuestions: CandidateQuestion[];
  redFlags: string;
  interestLevel: number;
  nextAction: string;
  followUpDate: string;
  notes: string;
}

type FieldKey = keyof CallFormValues;
type Errors = Partial<Record<FieldKey, string>>;

/** Which tab holds each validated field, so errors can link to it. */
const FIELD_TAB: Partial<Record<FieldKey, TabId>> = {
  recruiterName: "contact",
  recruiterEmail: "contact",
  companyName: "contact",
  callDateTime: "contact",
  durationMinutes: "contact",
  jobTitle: "job",
  compMax: "job",
  followUpDate: "followup",
  nextAction: "followup",
};

const FIELD_INPUT_ID: Partial<Record<FieldKey, string>> = {
  recruiterName: "call-rec-name",
  recruiterEmail: "call-rec-email",
  companyName: "call-company",
  callDateTime: "call-datetime",
  durationMinutes: "call-duration",
  jobTitle: "call-job-title",
  compMax: "call-comp-max",
  followUpDate: "call-followup-date",
  nextAction: "call-next-action",
};

function opportunityFields(data: AppData, opportunityId: string): Partial<CallFormValues> {
  const opp = findById(data.opportunities, opportunityId);
  if (!opp) return {};
  return {
    companyName: findById(data.companies, opp.companyId)?.name ?? "",
    jobTitle: opp.title,
    location: opp.location,
    workMode: opp.workMode,
    employmentType: opp.employmentType,
    compMin: opp.compensation ? String(opp.compensation.min) : "",
    compMax: opp.compensation ? String(opp.compensation.max) : "",
    compPeriod: opp.compensation?.period ?? "year",
    jobDescription: opp.jobDescription,
    requiredSkills: opp.requiredSkills.join(", "),
    preferredSkills: opp.preferredSkills.join(", "),
  };
}

function recruiterFields(data: AppData, recruiterId: string): Partial<CallFormValues> {
  const r = findById(data.recruiters, recruiterId);
  if (!r) return {};
  return {
    recruiterName: r.name,
    recruiterEmail: r.email,
    recruiterPhone: r.phone,
    recruiterAgency: r.agency ?? "",
  };
}

export function buildInitialValues(data: AppData, call?: RecruiterCall, presetOpportunityId?: ID): CallFormValues {
  const opportunityId = call?.opportunityId ?? (findById(data.opportunities, presetOpportunityId)?.id ?? NEW);
  const opp = findById(data.opportunities, opportunityId);
  const recruiterId = call ? (call.recruiterId ?? NONE) : (opp?.recruiterId ?? NEW);
  const followUp = call ? getCallFollowUp(data, call.id) : undefined;

  return {
    opportunityId,
    recruiterId,
    recruiterName: "",
    recruiterEmail: "",
    recruiterPhone: "",
    recruiterAgency: "",
    companyName: "",
    callDateTime: toDateTimeLocalValue(call?.callDateTime ?? new Date().toISOString()),
    durationMinutes: call ? String(call.durationMinutes) : "30",
    jobTitle: "",
    location: "",
    workMode: "hybrid",
    employmentType: "full_time",
    compMin: "",
    compMax: "",
    compPeriod: "year",
    jobDescription: "",
    requiredSkills: "",
    preferredSkills: "",
    hiringManagerPriorities: call?.hiringManagerPriorities.join("\n") ?? "",
    interviewStages: call?.interviewStages.join("\n") ?? "",
    recruiterAdvice: call?.recruiterAdvice ?? "",
    technicalTopics: call?.technicalTopics.join(", ") ?? "",
    behavioralThemes: call?.behavioralThemes.join("\n") ?? "",
    candidateQuestions: call?.candidateQuestions ?? [],
    redFlags: call?.redFlags.join("\n") ?? "",
    interestLevel: call?.interestLevel ?? 5,
    nextAction: followUp?.title ?? "",
    followUpDate: followUp ? toDateInputValue(followUp.dueDate) : "",
    notes: call?.notes ?? "",
    ...opportunityFields(data, opportunityId),
    ...recruiterFields(data, recruiterId),
  };
}

function validate(v: CallFormValues): Errors {
  const e: Errors = {};
  if (v.recruiterId !== NONE && !v.recruiterName.trim()) e.recruiterName = "Recruiter name is required.";
  if (v.recruiterEmail && !/^\S+@\S+\.\S+$/.test(v.recruiterEmail)) e.recruiterEmail = "Enter a valid email address.";
  if (!v.companyName.trim()) e.companyName = "Company is required.";
  if (!v.callDateTime || Number.isNaN(new Date(v.callDateTime).getTime())) e.callDateTime = "Enter the call date and time.";
  const duration = Number(v.durationMinutes);
  if (!Number.isInteger(duration) || duration <= 0 || duration > 600)
    e.durationMinutes = "Duration must be a whole number of minutes between 1 and 600.";
  if (!v.jobTitle.trim()) e.jobTitle = "Job title is required.";
  if ((v.compMin || v.compMax) && (!v.compMin || !v.compMax)) e.compMax = "Enter both minimum and maximum, or leave both empty.";
  else if (v.compMin && !(Number(v.compMin) >= 0 && Number(v.compMax) >= Number(v.compMin)))
    e.compMax = "Maximum must be a number greater than or equal to the minimum.";
  if (v.nextAction.trim() && !v.followUpDate) e.followUpDate = "Choose a follow-up date for the next action.";
  if (!v.nextAction.trim() && v.followUpDate) e.nextAction = "Describe the next action for this follow-up date.";
  return e;
}

export function CallForm({ call, presetOpportunityId }: { call?: RecruiterCall; presetOpportunityId?: ID }) {
  const { data } = useAppStore();
  const actions = useActions();
  const router = useRouter();
  const [values, setValues] = useState<CallFormValues>(() => buildInitialValues(data, call, presetOpportunityId));
  const [errors, setErrors] = useState<Errors>({});
  const [tab, setTab] = useState<TabId>("contact");
  const summaryRef = useRef<HTMLDivElement>(null);
  const submit = useSubmit();

  const set = <K extends FieldKey>(key: K, value: CallFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  function selectOpportunity(id: string) {
    setValues((v) => ({
      ...v,
      opportunityId: id,
      ...opportunityFields(data, id),
      ...(id !== NEW ? { recruiterId: findById(data.opportunities, id)?.recruiterId ?? v.recruiterId } : {}),
      ...(id !== NEW ? recruiterFields(data, findById(data.opportunities, id)?.recruiterId ?? "") : {}),
    }));
  }

  function selectRecruiter(id: string) {
    setValues((v) => ({
      ...v,
      recruiterId: id,
      ...(id === NEW || id === NONE
        ? { recruiterName: "", recruiterEmail: "", recruiterPhone: "", recruiterAgency: "" }
        : recruiterFields(data, id)),
    }));
  }

  function focusField(key: FieldKey) {
    const target = FIELD_TAB[key];
    if (target) setTab(target);
    // Wait for the tab panel to render before focusing.
    setTimeout(() => document.getElementById(FIELD_INPUT_ID[key] ?? "")?.focus(), 0);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    const keys = Object.keys(nextErrors) as FieldKey[];
    if (keys.length) {
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }

    const companyName = values.companyName.trim();
    const existingCompany = data.companies.find((c) => c.name.toLowerCase() === companyName.toLowerCase());
    const opportunityData = {
      company: existingCompany ? { id: existingCompany.id } : { name: companyName },
      title: values.jobTitle.trim(),
      location: values.location.trim(),
      workMode: values.workMode,
      employmentType: values.employmentType,
      compensation: values.compMin
        ? { min: Number(values.compMin), max: Number(values.compMax), currency: "USD", period: values.compPeriod }
        : null,
      jobDescription: values.jobDescription.trim(),
      requiredSkills: parseList(values.requiredSkills),
      preferredSkills: parseList(values.preferredSkills),
    };
    const recruiterData = {
      name: values.recruiterName.trim(),
      email: values.recruiterEmail.trim(),
      phone: values.recruiterPhone.trim() || null,
      agency: values.recruiterAgency.trim() || null,
    };

    // One request saves the call with its opportunity, recruiter and follow-up atomically.
    const saved = await submit.run(
      () =>
        actions.saveCall(
          {
            opportunity:
              values.opportunityId === NEW
                ? { create: { ...opportunityData, stage: "recruiter_screen" } }
                : { id: values.opportunityId, update: opportunityData },
            recruiter:
              values.recruiterId === NONE
                ? null
                : values.recruiterId === NEW
                  ? { create: recruiterData }
                  : { id: values.recruiterId, update: recruiterData },
            followUp: values.nextAction.trim() ? { title: values.nextAction.trim(), dueDate: values.followUpDate } : null,
            callAt: new Date(values.callDateTime).toISOString(),
            durationMinutes: Number(values.durationMinutes),
            hiringManagerPriorities: parseLines(values.hiringManagerPriorities),
            interviewStages: parseLines(values.interviewStages),
            recruiterAdvice: values.recruiterAdvice.trim(),
            technicalTopics: parseList(values.technicalTopics),
            behavioralThemes: parseLines(values.behavioralThemes),
            candidateQuestions: values.candidateQuestions
              .filter((q) => q.question.trim())
              .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() })),
            redFlags: parseLines(values.redFlags),
            interestLevel: values.interestLevel,
            notes: values.notes,
          },
          call?.id,
        ),
      { success: call ? "Call saved" : "Call logged" },
    );
    if (saved) router.push(`/calls/${saved.id}`);
  }

  const errorKeys = Object.keys(errors) as FieldKey[];
  const tabHasError = (id: TabId) => errorKeys.some((k) => FIELD_TAB[k] === id);
  const isNewOpportunity = values.opportunityId === NEW;
  const cancelHref = call ? `/calls/${call.id}` : "/calls";

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {errorKeys.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm outline-none"
        >
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertCircle className="size-4" aria-hidden /> Please fix {errorKeys.length} field
            {errorKeys.length > 1 ? "s" : ""} before saving:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {errorKeys.map((key) => (
              <li key={key}>
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => focusField(key)}>
                  {errors[key]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="call-opportunity"
            label="Linked opportunity"
            hint="Job details are shared with the opportunity — editing them here updates it."
          >
            <Select value={values.opportunityId} onValueChange={selectOpportunity}>
              <SelectTrigger {...fieldAria("call-opportunity", undefined, "hint")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW}>+ New opportunity from this call</SelectItem>
                {data.opportunities.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {findById(data.companies, o.companyId)?.name} — {o.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="call-recruiter" label="Recruiter">
            <Select value={values.recruiterId} onValueChange={selectRecruiter}>
              <SelectTrigger id="call-recruiter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW}>+ New recruiter</SelectItem>
                <SelectItem value={NONE}>No recruiter</SelectItem>
                {data.recruiters.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.agency ? ` (${r.agency})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
        <TabsList aria-label="Call sections">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
              {tabHasError(t.id) && (
                <span className="size-1.5 rounded-full bg-destructive" aria-label="(has errors)" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* forceMount keeps every section's inputs mounted so state & focus targets persist. */}
        <TabsContent value="contact" forceMount hidden={tab !== "contact"}>
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="call-rec-name" label="Recruiter name" required error={errors.recruiterName}>
                <Input {...fieldAria("call-rec-name", errors.recruiterName)} value={values.recruiterName} onChange={(e) => set("recruiterName", e.target.value)} disabled={values.recruiterId === NONE} />
              </Field>
              <Field id="call-company" label="Company" required error={errors.companyName} hint="Hiring company for this role">
                <Input
                  {...fieldAria("call-company", errors.companyName, "hint")}
                  list="call-company-options"
                  value={values.companyName}
                  onChange={(e) => set("companyName", e.target.value)}
                />
                <datalist id="call-company-options">
                  {data.companies.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </Field>
              <Field id="call-rec-email" label="Email" error={errors.recruiterEmail}>
                <Input {...fieldAria("call-rec-email", errors.recruiterEmail)} type="email" value={values.recruiterEmail} onChange={(e) => set("recruiterEmail", e.target.value)} disabled={values.recruiterId === NONE} />
              </Field>
              <Field id="call-rec-phone" label="Phone number">
                <Input id="call-rec-phone" type="tel" value={values.recruiterPhone} onChange={(e) => set("recruiterPhone", e.target.value)} disabled={values.recruiterId === NONE} />
              </Field>
              <Field id="call-rec-agency" label="Agency" hint="Leave empty for in-house recruiters">
                <Input {...fieldAria("call-rec-agency", undefined, "hint")} value={values.recruiterAgency} onChange={(e) => set("recruiterAgency", e.target.value)} disabled={values.recruiterId === NONE} />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
                <Field id="call-datetime" label="Call date and time" required error={errors.callDateTime}>
                  <Input {...fieldAria("call-datetime", errors.callDateTime)} type="datetime-local" value={values.callDateTime} onChange={(e) => set("callDateTime", e.target.value)} />
                </Field>
                <Field id="call-duration" label="Minutes" required error={errors.durationMinutes}>
                  <Input {...fieldAria("call-duration", errors.durationMinutes)} type="number" min={1} max={600} value={values.durationMinutes} onChange={(e) => set("durationMinutes", e.target.value)} />
                </Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="job" forceMount hidden={tab !== "job"}>
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {!isNewOpportunity && (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  These fields belong to the linked opportunity. Saving updates it everywhere.
                </p>
              )}
              <Field id="call-job-title" label="Job title" required error={errors.jobTitle}>
                <Input {...fieldAria("call-job-title", errors.jobTitle)} value={values.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} />
              </Field>
              <Field id="call-location" label="Location">
                <Input id="call-location" value={values.location} onChange={(e) => set("location", e.target.value)} />
              </Field>
              <Field id="call-workmode" label="Remote, hybrid or onsite">
                <Select value={values.workMode} onValueChange={(v) => set("workMode", v as WorkMode)}>
                  <SelectTrigger id="call-workmode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(WORK_MODE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="call-employment" label="Employment type">
                <Select value={values.employmentType} onValueChange={(v) => set("employmentType", v as EmploymentType)}>
                  <SelectTrigger id="call-employment" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <fieldset className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-3">
                <legend className="mb-1.5 text-sm font-medium">Compensation range (USD)</legend>
                <Field id="call-comp-min" label="Minimum">
                  <Input id="call-comp-min" inputMode="numeric" value={values.compMin} onChange={(e) => set("compMin", e.target.value)} />
                </Field>
                <Field id="call-comp-max" label="Maximum" error={errors.compMax}>
                  <Input {...fieldAria("call-comp-max", errors.compMax)} inputMode="numeric" value={values.compMax} onChange={(e) => set("compMax", e.target.value)} />
                </Field>
                <Field id="call-comp-period" label="Per">
                  <Select value={values.compPeriod} onValueChange={(v) => set("compPeriod", v as "year" | "hour")}>
                    <SelectTrigger id="call-comp-period" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="year">Year</SelectItem>
                      <SelectItem value="hour">Hour</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </fieldset>
              <Field id="call-job-description" label="Job description" className="sm:col-span-2">
                <Textarea id="call-job-description" rows={5} value={values.jobDescription} onChange={(e) => set("jobDescription", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requirements" forceMount hidden={tab !== "requirements"}>
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="call-required" label="Required skills" hint="Comma-separated">
                <Textarea {...fieldAria("call-required", undefined, "hint")} rows={3} value={values.requiredSkills} onChange={(e) => set("requiredSkills", e.target.value)} />
              </Field>
              <Field id="call-preferred" label="Preferred skills" hint="Comma-separated">
                <Textarea {...fieldAria("call-preferred", undefined, "hint")} rows={3} value={values.preferredSkills} onChange={(e) => set("preferredSkills", e.target.value)} />
              </Field>
              <Field id="call-priorities" label="Hiring manager priorities" hint="One per line" className="sm:col-span-2">
                <Textarea {...fieldAria("call-priorities", undefined, "hint")} rows={4} value={values.hiringManagerPriorities} onChange={(e) => set("hiringManagerPriorities", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="intelligence" forceMount hidden={tab !== "intelligence"}>
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="call-stages" label="Interview process and stages" hint="One stage per line">
                <Textarea {...fieldAria("call-stages", undefined, "hint")} rows={4} value={values.interviewStages} onChange={(e) => set("interviewStages", e.target.value)} />
              </Field>
              <Field id="call-advice" label="Recruiter advice">
                <Textarea id="call-advice" rows={4} value={values.recruiterAdvice} onChange={(e) => set("recruiterAdvice", e.target.value)} />
              </Field>
              <Field id="call-topics" label="Technical topics likely to be tested" hint="Comma-separated">
                <Textarea {...fieldAria("call-topics", undefined, "hint")} rows={3} value={values.technicalTopics} onChange={(e) => set("technicalTopics", e.target.value)} />
              </Field>
              <Field id="call-themes" label="Behavioral themes" hint="One per line">
                <Textarea {...fieldAria("call-themes", undefined, "hint")} rows={3} value={values.behavioralThemes} onChange={(e) => set("behavioralThemes", e.target.value)} />
              </Field>
              <CandidateQuestionsEditor
                questions={values.candidateQuestions}
                onChange={(qs) => set("candidateQuestions", qs)}
              />
              <Field id="call-red-flags" label="Red flags" hint="One per line">
                <Textarea {...fieldAria("call-red-flags", undefined, "hint")} rows={3} value={values.redFlags} onChange={(e) => set("redFlags", e.target.value)} />
              </Field>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span id="call-interest-label" className="text-sm font-medium">
                    Interest level
                  </span>
                  <span className="text-sm font-semibold tabular-nums">{values.interestLevel} / 10</span>
                </div>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={[values.interestLevel]}
                  onValueChange={([v]) => set("interestLevel", v)}
                  aria-label="Interest level from 1 to 10"
                />
                <div className="flex justify-between text-xs text-muted-foreground" aria-hidden>
                  <span>1 · Not interested</span>
                  <span>10 · Very interested</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="followup" forceMount hidden={tab !== "followup"}>
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <Field id="call-next-action" label="Next action" error={errors.nextAction} hint="Creates a follow-up task">
                <Input {...fieldAria("call-next-action", errors.nextAction, "hint")} value={values.nextAction} onChange={(e) => set("nextAction", e.target.value)} />
              </Field>
              <Field id="call-followup-date" label="Follow-up date" error={errors.followUpDate}>
                <Input {...fieldAria("call-followup-date", errors.followUpDate)} type="date" value={values.followUpDate} onChange={(e) => set("followUpDate", e.target.value)} />
              </Field>
              <Field id="call-notes" label="Full recruiter call notes" className="sm:col-span-2">
                <Textarea id="call-notes" rows={12} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <FormError message={submit.error} />

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {call ? "Recordings are managed on the call's Recording tab." : "You can attach a recording after saving the call."}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => router.push(cancelHref)}>
            Cancel
          </Button>
          <Button type="submit" disabled={submit.pending}>
            {submit.pending ? "Saving…" : call ? "Save changes" : "Save call"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function CandidateQuestionsEditor({
  questions,
  onChange,
}: {
  questions: CandidateQuestion[];
  onChange: (questions: CandidateQuestion[]) => void;
}) {
  const update = (id: string, patch: Partial<CandidateQuestion>) =>
    onChange(questions.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  return (
    <fieldset className="flex flex-col gap-3 sm:col-span-2">
      <legend className="mb-1.5 text-sm font-medium">Questions you asked & recruiter answers</legend>
      {questions.length === 0 && <p className="text-sm text-muted-foreground">No questions recorded yet.</p>}
      {questions.map((q, index) => (
        <div key={q.id} className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`cq-q-${q.id}`} className="text-xs font-medium text-muted-foreground">
              Question {index + 1}
            </label>
            <Input id={`cq-q-${q.id}`} value={q.question} onChange={(e) => update(q.id, { question: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`cq-a-${q.id}`} className="text-xs font-medium text-muted-foreground">
              Recruiter answer
            </label>
            <Input id={`cq-a-${q.id}`} value={q.answer} onChange={(e) => update(q.id, { answer: e.target.value })} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="self-end"
            aria-label={`Remove question ${index + 1}`}
            onClick={() => onChange(questions.filter((x) => x.id !== q.id))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onChange([...questions, { id: createId("cq"), question: "", answer: "" }])}
      >
        <Plus /> Add question
      </Button>
    </fieldset>
  );
}
