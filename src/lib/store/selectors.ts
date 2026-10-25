import type { AppData, FollowUpTask, ID, Interview, Opportunity, RecruiterCall } from "@/types";

/** Pure, derived views over AppData. Dashboard numbers must come from here. */

export function findById<T extends { id: ID }>(list: T[], id: ID | undefined) {
  return id ? list.find((item) => item.id === id) : undefined;
}

export function isActiveOpportunity(opportunity: Opportunity) {
  return opportunity.stage !== "closed";
}

export function isUpcomingInterview(interview: Interview, now: Date) {
  return interview.status === "scheduled" && new Date(interview.scheduledAt) >= now;
}

export function sortByDateAsc<T>(list: T[], getDate: (item: T) => string) {
  return list.slice().sort((a, b) => +new Date(getDate(a)) - +new Date(getDate(b)));
}

export function sortByDateDesc<T>(list: T[], getDate: (item: T) => string) {
  return list.slice().sort((a, b) => +new Date(getDate(b)) - +new Date(getDate(a)));
}

export function getUpcomingInterviews(data: AppData, now: Date) {
  return sortByDateAsc(
    data.interviews.filter((i) => isUpcomingInterview(i, now)),
    (i) => i.scheduledAt,
  );
}

export function getPendingFollowUps(data: AppData) {
  return sortByDateAsc(
    data.followUps.filter((f) => !f.completed),
    (f) => f.dueDate,
  );
}

export function isOverdue(task: Pick<FollowUpTask, "dueDate" | "completed">, now: Date) {
  return !task.completed && new Date(task.dueDate) < now;
}

export function getDashboardMetrics(data: AppData, now: Date) {
  return {
    totalCalls: data.calls.length,
    activeOpportunities: data.opportunities.filter(isActiveOpportunity).length,
    upcomingInterviews: getUpcomingInterviews(data, now).length,
    pendingFollowUps: getPendingFollowUps(data).length,
    overdueFollowUps: data.followUps.filter((f) => isOverdue(f, now)).length,
  };
}

/** The next pending follow-up created from a call, if any. */
export function getCallFollowUp(data: AppData, callId: ID) {
  const tasks = data.followUps.filter((f) => f.callId === callId);
  return sortByDateAsc(tasks.filter((t) => !t.completed), (t) => t.dueDate)[0] ?? tasks[0];
}

export function getCallRecordings(data: AppData, callId: ID) {
  return data.recordings.filter((r) => r.callId === callId);
}

/** Skill mentions across recruiter-call technical topics and opportunity required skills. */
export function getSkillFrequency(data: AppData, limit = 8) {
  const counts = new Map<string, { label: string; count: number }>();
  const add = (skill: string) => {
    const key = skill.trim().toLowerCase();
    if (!key) return;
    const entry = counts.get(key) ?? { label: skill.trim(), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  };
  data.calls.forEach((c) => c.technicalTopics.forEach(add));
  data.opportunities.forEach((o) => o.requiredSkills.forEach(add));
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, limit);
}

/** Recruiter intelligence aggregated across all calls for an opportunity. */
export function getOpportunityIntel(data: AppData, opportunityId: ID) {
  const calls = sortByDateDesc(
    data.calls.filter((c) => c.opportunityId === opportunityId),
    (c) => c.callDateTime,
  );
  const unique = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  return {
    calls,
    technicalTopics: unique(calls.flatMap((c) => c.technicalTopics)),
    behavioralThemes: unique(calls.flatMap((c) => c.behavioralThemes)),
    hiringManagerPriorities: unique(calls.flatMap((c) => c.hiringManagerPriorities)),
    redFlags: unique(calls.flatMap((c) => c.redFlags)),
    advice: calls
      .filter((c) => c.recruiterAdvice.trim())
      .map((c) => ({ callId: c.id, date: c.callDateTime, text: c.recruiterAdvice })),
  };
}

export interface CallRow {
  call: RecruiterCall;
  recruiterName: string;
  companyName: string;
  jobTitle: string;
  opportunity?: Opportunity;
  followUp?: FollowUpTask;
  recordingCount: number;
}

/** Joins calls with their related records for list display and search. */
export function getCallRows(data: AppData): CallRow[] {
  return sortByDateDesc(data.calls, (c) => c.callDateTime).map((call) => {
    const opportunity = findById(data.opportunities, call.opportunityId);
    const company = findById(data.companies, opportunity?.companyId);
    return {
      call,
      recruiterName: findById(data.recruiters, call.recruiterId)?.name ?? "No recruiter",
      companyName: company?.name ?? "Unknown company",
      jobTitle: opportunity?.title ?? "Unknown role",
      opportunity,
      followUp: getCallFollowUp(data, call.id),
      recordingCount: getCallRecordings(data, call.id).filter((r) => r.status === "uploaded").length,
    };
  });
}
