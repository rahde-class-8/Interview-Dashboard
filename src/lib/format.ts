import type {
  CompensationRange,
  EmploymentType,
  InterviewFormat,
  InterviewOutcome,
  InterviewStatus,
  OpportunityStage,
  WorkMode,
} from "@/types";

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  new: "New Opportunity",
  recruiter_screen: "Recruiter Screen",
  technical: "Technical Interview",
  hiring_manager: "Hiring Manager",
  offer: "Offer",
  closed: "Closed",
};

export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "Onsite",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full-time",
  contract: "Contract",
  contract_to_hire: "Contract-to-hire",
  part_time: "Part-time",
};

export const INTERVIEW_STATUS_LABELS: Record<InterviewStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  rescheduled: "Rescheduled",
};

export const INTERVIEW_OUTCOME_LABELS: Record<InterviewOutcome, string> = {
  pending: "Pending",
  advanced: "Advanced",
  rejected: "Rejected",
  offer: "Offer",
};

export const INTERVIEW_FORMAT_LABELS: Record<InterviewFormat, string> = {
  video: "Video",
  phone: "Phone",
  onsite: "Onsite",
};

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatCompensation(comp?: CompensationRange) {
  if (!comp) return "Not disclosed";
  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: comp.currency,
      maximumFractionDigits: 0,
      notation: comp.period === "year" && n >= 10000 ? "compact" : "standard",
    }).format(n);
  return `${fmt(comp.min)} – ${fmt(comp.max)} / ${comp.period === "year" ? "yr" : "hr"}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** Relative day label, e.g. "Today", "Tomorrow", "In 3 days", "2 days ago". */
export function formatRelativeDay(iso: string, now = new Date()) {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(new Date(iso)) - startOf(now)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Converts an ISO string to the value format used by <input type="datetime-local">. */
export function toDateTimeLocalValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converts an ISO string to the value format used by <input type="date">. */
export function toDateInputValue(iso: string) {
  return toDateTimeLocalValue(iso).slice(0, 10);
}

/** Parses a <input type="date"> value as local noon to avoid timezone day-shifts. */
export function fromDateInputValue(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

/** Splits multi-line / comma-separated text into a trimmed list. */
export function parseList(text: string) {
  return text
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Splits multi-line text into a trimmed list (commas are preserved). */
export function parseLines(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}
