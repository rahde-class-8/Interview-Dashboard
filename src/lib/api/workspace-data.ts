"use client";

import type { Call } from "@/shared/contracts/calls";
import type { ActivityEvent, Comment, Invitation, Member, SharedNote } from "@/shared/contracts/collaboration";
import type { Company } from "@/shared/contracts/companies";
import type { FollowUp } from "@/shared/contracts/follow-ups";
import type { Interview } from "@/shared/contracts/interviews";
import type { Opportunity } from "@/shared/contracts/opportunities";
import type { PreparationTask, Question, StarStory } from "@/shared/contracts/preparation";
import type { Recording } from "@/shared/contracts/recordings";
import type { Recruiter } from "@/shared/contracts/recruiters";
import type { AppAction } from "@/lib/store/reducer";
import type { AppData, User, Workspace } from "@/types";
import { ApiClientError, api, listAll } from "./client";
import * as map from "./mappers";

export const ws = (workspaceId: string, path = "") => `/workspaces/${workspaceId}${path}`;

const ACTIVITY_PAGE = 50;

async function loadCollaborators(workspace: Workspace, signal?: AbortSignal) {
  const [members, invitations] = await Promise.all([
    api<{ data: Member[] }>(ws(workspace.id, "/members"), { signal }),
    // Only owners may list invitations.
    workspace.role === "owner" ? listAll<Invitation>(ws(workspace.id, "/invitations?status=all"), signal) : Promise.resolve([]),
  ]);
  return map.toCollaborators(workspace.id, members.data, invitations);
}

async function loadActivity(workspaceId: string, signal?: AbortSignal) {
  const page = await api<{ data: ActivityEvent[] }>(ws(workspaceId, `/activity?limit=${ACTIVITY_PAGE}`), { signal });
  return page.data.map(map.toActivity);
}

/** Loads everything the UI shows for one workspace (MVP volumes; paged requests in parallel). */
export async function loadWorkspaceData(workspace: Workspace, currentUser: User, signal?: AbortSignal): Promise<AppData> {
  const id = workspace.id;
  const [
    companies,
    recruiters,
    opportunities,
    calls,
    recordings,
    interviews,
    followUps,
    preparationTasks,
    starStories,
    questions,
    sharedNotes,
    comments,
    activity,
    collaborators,
  ] = await Promise.all([
    listAll<Company>(ws(id, "/companies"), signal),
    listAll<Recruiter>(ws(id, "/recruiters"), signal),
    listAll<Opportunity>(ws(id, "/opportunities"), signal),
    listAll<Call>(ws(id, "/calls?view=detail"), signal),
    listAll<Recording>(ws(id, "/recordings"), signal),
    listAll<Interview>(ws(id, "/interviews"), signal),
    listAll<FollowUp>(ws(id, "/follow-ups"), signal),
    listAll<PreparationTask>(ws(id, "/preparation-tasks"), signal),
    listAll<StarStory>(ws(id, "/star-stories"), signal),
    listAll<Question>(ws(id, "/questions"), signal),
    listAll<SharedNote>(ws(id, "/notes?view=detail"), signal),
    listAll<Comment>(ws(id, "/comments"), signal),
    loadActivity(id, signal),
    loadCollaborators(workspace, signal),
  ]);

  return {
    currentUser,
    workspace,
    collaborators,
    companies: companies.map(map.toCompany),
    recruiters: recruiters.map(map.toRecruiter),
    opportunities: opportunities.map(map.toOpportunity),
    calls: calls.map(map.toCall),
    recordings: recordings.map(map.toRecording),
    interviews: interviews.map(map.toInterview),
    followUps: followUps.map(map.toFollowUp),
    preparationTasks: preparationTasks.map(map.toPrepTask),
    starStories: starStories.map(map.toStarStory),
    questions: questions.map(map.toQuestion),
    sharedNotes: sharedNotes.map((n) => map.toNote(n)),
    comments: comments.map(map.toComment),
    activity,
  };
}

const isNotFound = (error: unknown) => error instanceof ApiClientError && error.status === 404;

/** Fetches one record and returns the store action that applies it (upsert, or delete if gone). */
async function refetch<T>(path: string, onFound: (record: T) => AppAction, onGone: AppAction): Promise<AppAction> {
  try {
    return onFound(await api<T>(path));
  } catch (error) {
    if (isNotFound(error)) return onGone;
    throw error;
  }
}

/**
 * Re-reads a changed record from the API (where RLS applies) and returns the
 * store actions to apply. Used after Realtime notifications and composite writes.
 */
export async function refreshRecord(workspace: Workspace, table: string, recordId: string): Promise<AppAction[]> {
  const id = workspace.id;
  switch (table) {
    case "opportunities":
      return [
        await refetch<Opportunity>(ws(id, `/opportunities/${recordId}`), (o) => ({ type: "opportunity/upsert", opportunity: map.toOpportunity(o) }), {
          type: "opportunity/delete",
          id: recordId,
        }),
      ];
    case "recruiter_calls":
      return [await refetch<Call>(ws(id, `/calls/${recordId}`), (c) => ({ type: "call/upsert", call: map.toCall(c) }), { type: "call/delete", id: recordId })];
    case "companies":
      return [await refetch<Company>(ws(id, `/companies/${recordId}`), (c) => ({ type: "company/upsert", company: map.toCompany(c) }), { type: "company/delete", id: recordId })];
    case "recruiters":
      return [
        await refetch<Recruiter>(ws(id, `/recruiters/${recordId}`), (r) => ({ type: "recruiter/upsert", recruiter: map.toRecruiter(r) }), {
          type: "recruiter/delete",
          id: recordId,
        }),
      ];
    case "interviews":
      return [
        await refetch<Interview>(ws(id, `/interviews/${recordId}`), (i) => ({ type: "interview/upsert", interview: map.toInterview(i) }), {
          type: "interview/delete",
          id: recordId,
        }),
      ];
    case "preparation_tasks":
      return [
        await refetch<PreparationTask>(ws(id, `/preparation-tasks/${recordId}`), (t) => ({ type: "prepTask/upsert", task: map.toPrepTask(t) }), {
          type: "prepTask/delete",
          id: recordId,
        }),
      ];
    case "follow_up_tasks":
      return [
        await refetch<FollowUp>(ws(id, `/follow-ups/${recordId}`), (f) => ({ type: "followUp/upsert", task: map.toFollowUp(f) }), {
          type: "followUp/delete",
          id: recordId,
        }),
      ];
    case "questions":
      return [
        await refetch<Question>(ws(id, `/questions/${recordId}`), (q) => ({ type: "question/upsert", question: map.toQuestion(q) }), {
          type: "question/delete",
          id: recordId,
        }),
      ];
    case "star_stories":
      return [
        await refetch<StarStory>(ws(id, `/star-stories/${recordId}`), (s) => ({ type: "starStory/upsert", story: map.toStarStory(s) }), {
          type: "starStory/delete",
          id: recordId,
        }),
      ];
    case "recordings":
      return [
        await refetch<Recording>(
          ws(id, `/recordings/${recordId}`),
          (r) => ({ type: "recording/upsert", recording: map.toRecording(r) }),
          { type: "recording/remove", id: recordId },
        ),
      ];
    case "shared_notes":
      return [await refetch<SharedNote>(ws(id, `/notes/${recordId}`), (n) => ({ type: "note/upsert", note: map.toNote(n) }), { type: "note/delete", id: recordId })];
    case "comments": {
      // Comments have no single-record endpoint; re-read all threads (small).
      const comments = await listAll<Comment>(ws(id, "/comments"));
      return [{ type: "comment/replaceAll", comments: comments.map(map.toComment) }];
    }
    case "activity_events":
      return [{ type: "activity/replaceAll", activity: await loadActivity(id) }];
    case "workspace_members":
      return [{ type: "collaborator/replaceAll", collaborators: await loadCollaborators(workspace) }];
    default:
      return [];
  }
}

export { loadCollaborators, loadActivity };
