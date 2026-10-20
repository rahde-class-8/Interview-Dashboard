"use client";

import { useMemo } from "react";

import { createId } from "@/lib/id";
import { STAGE_LABELS } from "@/lib/format";
import type {
  CollaboratorRole,
  FollowUpTask,
  ID,
  Interview,
  InterviewQuestion,
  Opportunity,
  OpportunityStage,
  PreparationTask,
  RecordingAttachment,
  Recruiter,
  RecruiterCall,
  SharedNote,
  StarStory,
} from "@/types";
import { useAppStore } from "./app-store";

export type OpportunityInput = Omit<
  Opportunity,
  "id" | "companyId" | "recruiterId" | "createdAt" | "updatedAt" | "prepNotes"
> & {
  companyName: string;
  recruiterId: ID;
  prepNotes?: string;
};

export type RecruiterInput = Omit<Recruiter, "id" | "companyId">;

export type CallInput = Omit<RecruiterCall, "id" | "createdAt" | "updatedAt">;

/**
 * Domain operations used by the UI. Today they update in-memory state; when a
 * backend exists each one becomes an API request followed by a dispatch.
 */
export function useActions() {
  const { data, dispatch } = useAppStore();

  return useMemo(() => {
    const now = () => new Date().toISOString();
    const actor = data.currentUser.name;

    const logActivity = (description: string) =>
      dispatch({
        type: "activity/log",
        event: {
          id: createId("act"),
          workspaceId: data.workspace.id,
          actorName: actor,
          description,
          createdAt: now(),
        },
      });

    // Companies created during this render's handlers; `data` is a snapshot,
    // so repeated lookups in one handler must not create duplicates.
    const createdCompanies = new Map<string, ID>();

    /** Finds a company by case-insensitive name, creating it if needed. */
    const ensureCompany = (name: string): ID => {
      const trimmed = name.trim();
      const key = trimmed.toLowerCase();
      const existing = data.companies.find((c) => c.name.toLowerCase() === key);
      if (existing) return existing.id;
      const pending = createdCompanies.get(key);
      if (pending) return pending;
      const id = createId("co");
      createdCompanies.set(key, id);
      dispatch({
        type: "company/upsert",
        company: { id, name: trimmed, industry: "—", headquarters: "—" },
      });
      return id;
    };

    return {
      ensureCompany,

      saveRecruiter(input: RecruiterInput, companyId: ID, id?: ID): ID {
        const recruiterId = id ?? createId("rec");
        dispatch({ type: "recruiter/upsert", recruiter: { ...input, id: recruiterId, companyId } });
        return recruiterId;
      },

      saveOpportunity(input: OpportunityInput, id?: ID): ID {
        const { companyName, prepNotes, ...rest } = input;
        const existing = data.opportunities.find((o) => o.id === id);
        const opportunityId = existing?.id ?? createId("opp");
        dispatch({
          type: "opportunity/upsert",
          opportunity: {
            ...rest,
            id: opportunityId,
            companyId: ensureCompany(companyName),
            prepNotes: prepNotes ?? existing?.prepNotes ?? "",
            createdAt: existing?.createdAt ?? now(),
            updatedAt: now(),
          },
        });
        if (!existing) logActivity(`added opportunity “${input.title}”`);
        return opportunityId;
      },

      updateOpportunity(id: ID, patch: Partial<Opportunity>) {
        const existing = data.opportunities.find((o) => o.id === id);
        if (!existing) return;
        dispatch({
          type: "opportunity/upsert",
          opportunity: { ...existing, ...patch, updatedAt: now() },
        });
      },

      setOpportunityStage(id: ID, stage: OpportunityStage) {
        const opp = data.opportunities.find((o) => o.id === id);
        if (!opp || opp.stage === stage) return;
        dispatch({ type: "opportunity/setStage", id, stage, at: now() });
        logActivity(`moved “${opp.title}” to ${STAGE_LABELS[stage]}`);
      },

      deleteOpportunity(id: ID) {
        dispatch({ type: "opportunity/delete", id });
      },

      saveCall(input: CallInput, id?: ID): ID {
        const existing = data.calls.find((c) => c.id === id);
        const callId = existing?.id ?? createId("call");
        dispatch({
          type: "call/upsert",
          call: {
            ...input,
            id: callId,
            createdAt: existing?.createdAt ?? now(),
            updatedAt: now(),
          },
        });
        if (!existing) logActivity("logged a recruiter call");
        return callId;
      },

      deleteCall(id: ID) {
        dispatch({ type: "call/delete", id });
      },

      addRecording(recording: Omit<RecordingAttachment, "id" | "addedAt">): ID {
        const recordingId = createId("recfile");
        dispatch({
          type: "recording/add",
          recording: { ...recording, id: recordingId, addedAt: now() },
        });
        return recordingId;
      },

      updateRecording(id: ID, patch: Partial<RecordingAttachment>) {
        dispatch({ type: "recording/update", id, patch });
      },

      removeRecording(id: ID) {
        dispatch({ type: "recording/remove", id });
      },

      saveFollowUp(input: Omit<FollowUpTask, "id"> & { id?: ID }): ID {
        const followUpId = input.id ?? createId("fu");
        dispatch({ type: "followUp/upsert", task: { ...input, id: followUpId } });
        return followUpId;
      },

      toggleFollowUp(id: ID) {
        dispatch({ type: "followUp/toggle", id, at: now() });
      },

      deleteFollowUp(id: ID) {
        dispatch({ type: "followUp/delete", id });
      },

      saveInterview(input: Omit<Interview, "id"> & { id?: ID }): ID {
        const interviewId = input.id ?? createId("int");
        dispatch({ type: "interview/upsert", interview: { ...input, id: interviewId } });
        return interviewId;
      },

      updateInterview(id: ID, patch: Partial<Interview>) {
        const existing = data.interviews.find((i) => i.id === id);
        if (existing) dispatch({ type: "interview/upsert", interview: { ...existing, ...patch } });
      },

      deleteInterview(id: ID) {
        dispatch({ type: "interview/delete", id });
      },

      savePrepTask(input: Omit<PreparationTask, "id"> & { id?: ID }): ID {
        const taskId = input.id ?? createId("prep");
        dispatch({ type: "prepTask/upsert", task: { ...input, id: taskId } });
        return taskId;
      },

      togglePrepTask(id: ID) {
        dispatch({ type: "prepTask/toggle", id });
      },

      deletePrepTask(id: ID) {
        dispatch({ type: "prepTask/delete", id });
      },

      saveStarStory(input: Omit<StarStory, "id"> & { id?: ID }): ID {
        const storyId = input.id ?? createId("star");
        dispatch({ type: "starStory/upsert", story: { ...input, id: storyId } });
        return storyId;
      },

      deleteStarStory(id: ID) {
        dispatch({ type: "starStory/delete", id });
      },

      saveQuestion(input: Omit<InterviewQuestion, "id"> & { id?: ID }): ID {
        const questionId = input.id ?? createId("q");
        dispatch({ type: "question/upsert", question: { ...input, id: questionId } });
        return questionId;
      },

      deleteQuestion(id: ID) {
        dispatch({ type: "question/delete", id });
      },

      inviteCollaborator(name: string, email: string, role: CollaboratorRole) {
        dispatch({
          type: "collaborator/add",
          collaborator: {
            id: createId("collab"),
            workspaceId: data.workspace.id,
            name,
            email,
            role,
            status: "pending",
            invitedAt: now(),
          },
        });
        logActivity(`added ${name} as ${role} (local only — no email sent)`);
      },

      setCollaboratorRole(id: ID, role: CollaboratorRole) {
        const c = data.collaborators.find((x) => x.id === id);
        dispatch({ type: "collaborator/setRole", id, role });
        if (c) logActivity(`changed ${c.name}'s role to ${role}`);
      },

      removeCollaborator(id: ID) {
        const c = data.collaborators.find((x) => x.id === id);
        dispatch({ type: "collaborator/remove", id });
        if (c) logActivity(`removed ${c.name} from the workspace`);
      },

      saveNote(input: Pick<SharedNote, "title" | "body" | "opportunityId"> & { id?: ID }): ID {
        const noteId = input.id ?? createId("note");
        dispatch({
          type: "note/upsert",
          note: {
            ...input,
            id: noteId,
            workspaceId: data.workspace.id,
            updatedAt: now(),
            updatedBy: actor,
          },
        });
        logActivity(`${input.id ? "edited" : "created"} “${input.title}”`);
        return noteId;
      },

      addComment(noteId: ID, body: string) {
        const note = data.sharedNotes.find((n) => n.id === noteId);
        dispatch({
          type: "comment/add",
          comment: {
            id: createId("cm"),
            workspaceId: data.workspace.id,
            noteId,
            authorName: actor,
            body,
            createdAt: now(),
          },
        });
        if (note) logActivity(`commented on “${note.title}”`);
      },

      deleteComment(id: ID) {
        dispatch({ type: "comment/delete", id });
      },
    };
  }, [data, dispatch]);
}
