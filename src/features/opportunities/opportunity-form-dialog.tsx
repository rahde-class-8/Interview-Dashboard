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
import { EMPLOYMENT_TYPE_LABELS, parseList, STAGE_LABELS, WORK_MODE_LABELS } from "@/lib/format";
import { useAppStore } from "@/lib/store/app-store";
import { findById } from "@/lib/store/selectors";
import { useActions } from "@/lib/store/use-actions";
import { FormError } from "@/components/shared/form-error";
import { useSubmit } from "@/lib/hooks/use-submit";
import {
  OPPORTUNITY_STAGES,
  type EmploymentType,
  type ID,
  type Opportunity,
  type OpportunityStage,
  type WorkMode,
} from "@/types";

const NEW_RECRUITER = "__new";
const NO_RECRUITER = "__none";

interface FormValues {
  companyName: string;
  title: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  compMin: string;
  compMax: string;
  compPeriod: "year" | "hour";
  stage: OpportunityStage;
  recruiterId: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string;
  jobDescription: string;
  requiredSkills: string;
  preferredSkills: string;
}

type Errors = Partial<Record<keyof FormValues, string>>;

export function OpportunityFormDialog({
  opportunity,
  trigger,
  onSaved,
}: {
  opportunity?: Opportunity;
  trigger: ReactNode;
  onSaved?: (id: ID) => void;
}) {
  const { data } = useAppStore();
  const actions = useActions();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(() => initialValues());
  const [errors, setErrors] = useState<Errors>({});
  const submit = useSubmit();

  function initialValues(): FormValues {
    const company = findById(data.companies, opportunity?.companyId);
    return {
      companyName: company?.name ?? "",
      title: opportunity?.title ?? "",
      location: opportunity?.location ?? "",
      workMode: opportunity?.workMode ?? "hybrid",
      employmentType: opportunity?.employmentType ?? "full_time",
      compMin: opportunity?.compensation ? String(opportunity.compensation.min) : "",
      compMax: opportunity?.compensation ? String(opportunity.compensation.max) : "",
      compPeriod: opportunity?.compensation?.period ?? "year",
      stage: opportunity?.stage ?? "new",
      recruiterId: opportunity ? (opportunity.recruiterId ?? NO_RECRUITER) : NO_RECRUITER,
      recruiterName: "",
      recruiterEmail: "",
      recruiterPhone: "",
      jobDescription: opportunity?.jobDescription ?? "",
      requiredSkills: opportunity?.requiredSkills.join(", ") ?? "",
      preferredSkills: opportunity?.preferredSkills.join(", ") ?? "",
    };
  }

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  function validate(): Errors {
    const e: Errors = {};
    if (!values.companyName.trim()) e.companyName = "Company is required.";
    if (!values.title.trim()) e.title = "Job title is required.";
    if (values.recruiterId === NEW_RECRUITER && !values.recruiterName.trim())
      e.recruiterName = "Recruiter name is required.";
    if (values.recruiterEmail && !/^\S+@\S+\.\S+$/.test(values.recruiterEmail))
      e.recruiterEmail = "Enter a valid email address.";
    const min = Number(values.compMin);
    const max = Number(values.compMax);
    if ((values.compMin || values.compMax) && (!values.compMin || !values.compMax))
      e.compMax = "Enter both minimum and maximum, or leave both empty.";
    else if (values.compMin && (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < min))
      e.compMax = "Maximum must be a number greater than or equal to the minimum.";
    return e;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const recruiter =
      values.recruiterId === NO_RECRUITER
        ? null
        : values.recruiterId === NEW_RECRUITER
          ? {
              create: {
                name: values.recruiterName.trim(),
                email: values.recruiterEmail.trim(),
                phone: values.recruiterPhone.trim() || null,
              },
            }
          : { id: values.recruiterId };
    const companyName = values.companyName.trim();
    const existingCompany = data.companies.find((c) => c.name.toLowerCase() === companyName.toLowerCase());

    const saved = await submit.run(
      () =>
        actions.saveOpportunity(
          {
            company: existingCompany ? { id: existingCompany.id } : { name: companyName },
            recruiter,
            title: values.title.trim(),
            location: values.location.trim(),
            workMode: values.workMode,
            employmentType: values.employmentType,
            compensation: values.compMin
              ? { min: Number(values.compMin), max: Number(values.compMax), currency: "USD", period: values.compPeriod }
              : null,
            stage: values.stage,
            jobDescription: values.jobDescription.trim(),
            requiredSkills: parseList(values.requiredSkills),
            preferredSkills: parseList(values.preferredSkills),
          },
          opportunity?.id,
        ),
      { success: opportunity ? "Opportunity saved" : "Opportunity created" },
    );
    if (!saved) return;
    setOpen(false);
    onSaved?.(saved.id);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setValues(initialValues());
          setErrors({});
          submit.reset();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{opportunity ? "Edit opportunity" : "New opportunity"}</DialogTitle>
          <DialogDescription>Track a role you are considering. Required fields are marked *.</DialogDescription>
        </DialogHeader>
        <form id="opportunity-form" onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field id="opp-company" label="Company" required error={errors.companyName} hint="Type an existing or new company">
            <Input
              {...fieldAria("opp-company", errors.companyName, "hint")}
              list="opp-company-options"
              value={values.companyName}
              onChange={(e) => set("companyName", e.target.value)}
            />
            <datalist id="opp-company-options">
              {data.companies.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </Field>
          <Field id="opp-title" label="Job title" required error={errors.title}>
            <Input {...fieldAria("opp-title", errors.title)} value={values.title} onChange={(e) => set("title", e.target.value)} />
          </Field>
          <Field id="opp-location" label="Location">
            <Input id="opp-location" value={values.location} onChange={(e) => set("location", e.target.value)} />
          </Field>
          <Field id="opp-workmode" label="Work arrangement">
            <Select value={values.workMode} onValueChange={(v) => set("workMode", v as WorkMode)}>
              <SelectTrigger id="opp-workmode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(WORK_MODE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="opp-employment" label="Employment type">
            <Select value={values.employmentType} onValueChange={(v) => set("employmentType", v as EmploymentType)}>
              <SelectTrigger id="opp-employment" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EMPLOYMENT_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="opp-stage" label="Pipeline stage">
            <Select value={values.stage} onValueChange={(v) => set("stage", v as OpportunityStage)}>
              <SelectTrigger id="opp-stage" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPPORTUNITY_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <fieldset className="grid grid-cols-1 gap-2 sm:col-span-2 sm:grid-cols-3">
            <legend className="mb-1.5 text-sm font-medium">Compensation (USD)</legend>
            <Field id="opp-comp-min" label="Minimum">
              <Input id="opp-comp-min" inputMode="numeric" value={values.compMin} onChange={(e) => set("compMin", e.target.value)} />
            </Field>
            <Field id="opp-comp-max" label="Maximum" error={errors.compMax}>
              <Input {...fieldAria("opp-comp-max", errors.compMax)} inputMode="numeric" value={values.compMax} onChange={(e) => set("compMax", e.target.value)} />
            </Field>
            <Field id="opp-comp-period" label="Per">
              <Select value={values.compPeriod} onValueChange={(v) => set("compPeriod", v as "year" | "hour")}>
                <SelectTrigger id="opp-comp-period" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="year">Year</SelectItem>
                  <SelectItem value="hour">Hour</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </fieldset>
          <Field id="opp-recruiter" label="Associated recruiter" className="sm:col-span-2">
            <Select value={values.recruiterId} onValueChange={(v) => set("recruiterId", v)}>
              <SelectTrigger id="opp-recruiter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {data.recruiters.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.agency ? ` (${r.agency})` : ""}
                  </SelectItem>
                ))}
                <SelectItem value={NO_RECRUITER}>No recruiter</SelectItem>
                <SelectItem value={NEW_RECRUITER}>+ New recruiter…</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {values.recruiterId === NEW_RECRUITER && (
            <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/40 p-3 sm:col-span-2 sm:grid-cols-3">
              <Field id="opp-rec-name" label="Recruiter name" required error={errors.recruiterName}>
                <Input {...fieldAria("opp-rec-name", errors.recruiterName)} value={values.recruiterName} onChange={(e) => set("recruiterName", e.target.value)} />
              </Field>
              <Field id="opp-rec-email" label="Email" error={errors.recruiterEmail}>
                <Input {...fieldAria("opp-rec-email", errors.recruiterEmail)} type="email" value={values.recruiterEmail} onChange={(e) => set("recruiterEmail", e.target.value)} />
              </Field>
              <Field id="opp-rec-phone" label="Phone">
                <Input id="opp-rec-phone" type="tel" value={values.recruiterPhone} onChange={(e) => set("recruiterPhone", e.target.value)} />
              </Field>
            </div>
          )}
          <Field id="opp-description" label="Job description" className="sm:col-span-2">
            <Textarea id="opp-description" rows={4} value={values.jobDescription} onChange={(e) => set("jobDescription", e.target.value)} />
          </Field>
          <Field id="opp-required" label="Required skills" hint="Comma-separated">
            <Input id="opp-required" value={values.requiredSkills} onChange={(e) => set("requiredSkills", e.target.value)} />
          </Field>
          <Field id="opp-preferred" label="Preferred skills" hint="Comma-separated">
            <Input id="opp-preferred" value={values.preferredSkills} onChange={(e) => set("preferredSkills", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <FormError message={submit.error} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="opportunity-form" disabled={submit.pending}>
            {submit.pending ? "Saving…" : opportunity ? "Save changes" : "Create opportunity"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
