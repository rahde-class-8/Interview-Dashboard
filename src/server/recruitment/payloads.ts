import "server-only";

import type { z } from "zod";

import type { opportunityCreateSchema, opportunityUpdateSchema } from "@/shared/contracts/opportunities";
import type { recruiterRefSchema } from "@/shared/contracts/recruiters";
import { pickDefined } from "../core/crud";
import { RECRUITER_COLUMNS } from "./recruiters";

type OpportunityInput = Partial<z.output<typeof opportunityCreateSchema>> | z.output<typeof opportunityUpdateSchema>;
type RecruiterRef = z.output<typeof recruiterRefSchema> | null;

const OPPORTUNITY_COLUMNS = {
  title: "title",
  location: "location",
  workMode: "work_mode",
  employmentType: "employment_type",
  stage: "stage",
  jobDescription: "job_description",
  requiredSkills: "required_skills",
  preferredSkills: "preferred_skills",
  prepNotes: "prep_notes",
};

/** Converts API opportunity fields into the snake_case payload used by the DB functions. */
export function toOpportunityData(input: OpportunityInput): Record<string, unknown> {
  const data = pickDefined(input as Record<string, unknown>, OPPORTUNITY_COLUMNS);
  if (input.company) {
    if ("id" in input.company) data.company_id = input.company.id;
    else data.company_name = input.company.name;
  }
  if (input.compensation === null) {
    Object.assign(data, { comp_min: null, comp_max: null, comp_period: null });
  } else if (input.compensation) {
    Object.assign(data, {
      comp_min: input.compensation.min,
      comp_max: input.compensation.max,
      comp_currency: input.compensation.currency,
      comp_period: input.compensation.period,
    });
  }
  return data;
}

export function toRecruiterRef(ref: RecruiterRef): Record<string, unknown> | null {
  if (ref === null) return null;
  if ("create" in ref) return { create: pickDefined(ref.create, RECRUITER_COLUMNS) };
  return ref.update ? { id: ref.id, update: pickDefined(ref.update, RECRUITER_COLUMNS) } : { id: ref.id };
}
