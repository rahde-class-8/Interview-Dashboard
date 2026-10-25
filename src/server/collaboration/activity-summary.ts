import type { ActivityEvent } from "@/shared/contracts/collaboration";

type Metadata = ActivityEvent["metadata"];

/** "recruiter_screen" → "Recruiter screen" */
export function humanize(value: unknown): string {
  const text = String(value ?? "").replace(/_/g, " ").trim();
  return text ? text[0]!.toUpperCase() + text.slice(1) : "";
}

const quote = (value: unknown) => (value ? `“${String(value)}”` : "an item");

function opportunityName(m: Metadata) {
  return m.company ? `${quote(m.title)} at ${m.company}` : quote(m.title);
}

/**
 * Builds a readable sentence for an activity event from its action and
 * display-label metadata. Unknown actions fall back to a generic sentence.
 */
export function describeActivity(action: string, metadata: Metadata, actorName: string | null): string {
  const who = actorName ?? "Someone";
  const m = metadata;
  switch (action) {
    case "opportunity.created":
      return `${who} added the opportunity ${opportunityName(m)}`;
    case "opportunity.stage_changed":
      return `${who} moved ${opportunityName(m)} from ${humanize(m.from)} to ${humanize(m.to)}`;
    case "opportunity.deleted":
      return `${who} deleted the opportunity ${quote(m.title)}`;
    case "call.logged":
      return `${who} logged a recruiter call for ${opportunityName(m)}`;
    case "call.deleted":
      return `${who} deleted a recruiter call for ${opportunityName(m)}`;
    case "interview.scheduled":
      return `${who} scheduled the interview ${quote(m.title)}${m.opportunity ? ` for ${quote(m.opportunity)}` : ""}`;
    case "interview.status_changed":
      return `${who} marked the interview ${quote(m.title)} as ${humanize(m.to).toLowerCase()}`;
    case "preparation_task.completed":
      return `${who} completed the preparation task ${quote(m.title)}`;
    case "follow_up.completed":
      return `${who} completed the follow-up ${quote(m.title)}`;
    case "recording.uploaded":
      return `${who} uploaded a recording for ${opportunityName(m)}`;
    case "recording.deleted":
      return `${who} deleted a recording for ${opportunityName(m)}`;
    case "recording.expired":
      return `A recording for ${opportunityName(m)} was deleted by the retention policy`;
    case "note.created":
      return `${who} created the note ${quote(m.title)}`;
    case "note.updated":
      return `${who} edited the note ${quote(m.title)}`;
    case "note.deleted":
      return `${who} deleted the note ${quote(m.title)}`;
    case "comment.added":
      return `${who} commented on ${quote(m.note)}`;
    case "comment.deleted":
      return `${who} deleted a comment on ${quote(m.note)}`;
    case "member.joined":
      return `${m.name ?? who} joined as ${humanize(m.role).toLowerCase()}`;
    case "member.role_changed":
      return `${who} changed ${m.name ?? "a member"}'s role from ${humanize(m.from).toLowerCase()} to ${humanize(m.to).toLowerCase()}`;
    case "member.removed":
      return `${who} removed ${m.name ?? "a member"} from the workspace`;
    case "member.left":
      return `${m.name ?? who} left the workspace`;
    case "invitation.sent":
      return `${who} invited a new ${humanize(m.role).toLowerCase()}`;
    case "invitation.revoked":
      return `${who} revoked an invitation`;
    case "workspace.renamed":
      return `${who} renamed the workspace to ${quote(m.to)}`;
    case "workspace.retention_changed":
      return m.days ? `${who} set recordings to be deleted after ${m.days} days` : `${who} set recordings to be kept until deleted`;
    default:
      return `${who} made a change`;
  }
}
