"use client";

import { useMemo } from "react";
import type { z } from "zod";

import { api } from "@/lib/api/client";
import * as map from "@/lib/api/mappers";
import { ws } from "@/lib/api/workspace-data";
import type { Call, callCreateSchema, callUpdateSchema } from "@/shared/contracts/calls";
import type {
  CollaboratorRole,
  Comment as ApiComment,
  InvitationCreated,
  Member,
  SharedNote as ApiNote,
} from "@/shared/contracts/collaboration";
import type { FollowUp, followUpCreateSchema, followUpUpdateSchema } from "@/shared/contracts/follow-ups";
import type { Interview as ApiInterview, interviewCreateSchema, interviewUpdateSchema } from "@/shared/contracts/interviews";
import type { Opportunity as ApiOpportunity, opportunityCreateSchema, opportunityUpdateSchema } from "@/shared/contracts/opportunities";
import type {
  PreparationTask as ApiPrepTask,
  Question,
  StarStory as ApiStarStory,
  preparationTaskCreateSchema,
  preparationTaskUpdateSchema,
  questionCreateSchema,
  questionUpdateSchema,
  starStoryCreateSchema,
  starStoryUpdateSchema,
} from "@/shared/contracts/preparation";
import type { Recording, RecordingCreateInput, RecordingPlayback, RecordingUploadResponse } from "@/shared/contracts/recordings";
import type { Me, Workspace as ApiWorkspace, workspaceUpdateSchema } from "@/shared/contracts/workspaces";
import type { FollowUpTask, ID, OpportunityStage, PreparationTask } from "@/types";
import { useAppStore } from "./app-store";

type In<S extends z.ZodType> = z.input<S>;

/**
 * Domain operations used by the UI. Each one calls the API first and updates
 * the local store with the record the server returns. Failures throw
 * ApiClientError (with field details) for the caller to display.
 */
export function useActions() {
  const { data, dispatch, refresh, refreshWorkspaces, reload } = useAppStore();
  const workspaceId = data.workspace.id;

  return useMemo(() => {
    const path = (p: string) => ws(workspaceId, p);

    const applyOpportunity = (o: ApiOpportunity) => {
      const opportunity = map.toOpportunity(o);
      dispatch({ type: "opportunity/upsert", opportunity });
      // The company/recruiter may have been created or edited by the same request.
      const related = [{ table: "companies", id: o.company.id }];
      if (o.recruiter) related.push({ table: "recruiters", id: o.recruiter.id });
      void refresh(related);
      return opportunity;
    };

    const applyCall = (c: Call) => {
      const call = map.toCall(c);
      dispatch({ type: "call/upsert", call });
      // Remove follow-ups this call no longer has, then re-read related records.
      for (const f of data.followUps) {
        if (f.callId === c.id && f.id !== c.followUp?.id) dispatch({ type: "followUp/delete", id: f.id });
      }
      const related = [
        { table: "opportunities", id: c.opportunity.id },
        { table: "companies", id: c.opportunity.company.id },
      ];
      if (c.recruiter) related.push({ table: "recruiters", id: c.recruiter.id });
      if (c.followUp) related.push({ table: "follow_up_tasks", id: c.followUp.id });
      void refresh(related);
      return call;
    };

    async function saveFollowUp(body: In<typeof followUpCreateSchema> | In<typeof followUpUpdateSchema>, id?: ID) {
      const f = id
        ? await api<FollowUp>(path(`/follow-ups/${id}`), { method: "PATCH", body })
        : await api<FollowUp>(path("/follow-ups"), { method: "POST", body });
      const task = map.toFollowUp(f);
      dispatch({ type: "followUp/upsert", task });
      return task;
    }

    async function savePrepTask(body: In<typeof preparationTaskCreateSchema> | In<typeof preparationTaskUpdateSchema>, id?: ID) {
      const t = id
        ? await api<ApiPrepTask>(path(`/preparation-tasks/${id}`), { method: "PATCH", body })
        : await api<ApiPrepTask>(path("/preparation-tasks"), { method: "POST", body });
      const task = map.toPrepTask(t);
      dispatch({ type: "prepTask/upsert", task });
      return task;
    }

    const applyNote = (n: ApiNote) => {
      const note = map.toNote(n);
      dispatch({ type: "note/upsert", note });
      return note;
    };

    return {
      // --- Opportunities -------------------------------------------------------------
      async saveOpportunity(body: In<typeof opportunityCreateSchema> | In<typeof opportunityUpdateSchema>, id?: ID) {
        const o = id
          ? await api<ApiOpportunity>(path(`/opportunities/${id}`), { method: "PATCH", body })
          : await api<ApiOpportunity>(path("/opportunities"), { method: "POST", body });
        return applyOpportunity(o);
      },

      async updateOpportunity(id: ID, body: In<typeof opportunityUpdateSchema>) {
        return applyOpportunity(await api<ApiOpportunity>(path(`/opportunities/${id}`), { method: "PATCH", body }));
      },

      /** Optimistic: the stage changes immediately and is reverted if the request fails. */
      async setOpportunityStage(id: ID, stage: OpportunityStage) {
        const previous = data.opportunities.find((o) => o.id === id);
        if (!previous || previous.stage === stage) return;
        dispatch({ type: "opportunity/setStage", id, stage, at: new Date().toISOString() });
        try {
          applyOpportunity(await api<ApiOpportunity>(path(`/opportunities/${id}/stage`), { method: "PUT", body: { stage } }));
        } catch (error) {
          dispatch({ type: "opportunity/upsert", opportunity: previous });
          throw error;
        }
      },

      async deleteOpportunity(id: ID) {
        await api(path(`/opportunities/${id}`), { method: "DELETE" });
        dispatch({ type: "opportunity/delete", id });
      },

      // --- Recruiter calls (composite: opportunity, recruiter and follow-up in one request)
      async saveCall(body: In<typeof callCreateSchema> | In<typeof callUpdateSchema>, id?: ID) {
        const c = id
          ? await api<Call>(path(`/calls/${id}`), { method: "PATCH", body })
          : await api<Call>(path("/calls"), { method: "POST", body });
        return applyCall(c);
      },

      async deleteCall(id: ID) {
        await api(path(`/calls/${id}`), { method: "DELETE" });
        dispatch({ type: "call/delete", id });
      },

      // --- Follow-ups --------------------------------------------------------------
      saveFollowUp,

      /** Optimistic: the checkbox flips immediately and reverts if the request fails. */
      async toggleFollowUp(task: FollowUpTask) {
        dispatch({ type: "followUp/upsert", task: { ...task, completed: !task.completed } });
        try {
          return await saveFollowUp({ completed: !task.completed }, task.id);
        } catch (error) {
          dispatch({ type: "followUp/upsert", task });
          throw error;
        }
      },

      async deleteFollowUp(id: ID) {
        await api(path(`/follow-ups/${id}`), { method: "DELETE" });
        dispatch({ type: "followUp/delete", id });
      },

      // --- Interviews -------------------------------------------------------------
      async saveInterview(body: In<typeof interviewCreateSchema> | In<typeof interviewUpdateSchema>, id?: ID) {
        const i = id
          ? await api<ApiInterview>(path(`/interviews/${id}`), { method: "PATCH", body })
          : await api<ApiInterview>(path("/interviews"), { method: "POST", body });
        const interview = map.toInterview(i);
        dispatch({ type: "interview/upsert", interview });
        return interview;
      },

      async deleteInterview(id: ID) {
        await api(path(`/interviews/${id}`), { method: "DELETE" });
        dispatch({ type: "interview/delete", id });
      },

      // --- Preparation tasks, STAR stories, questions -------------------------------------
      savePrepTask,

      /** Optimistic, like toggleFollowUp. */
      async togglePrepTask(task: PreparationTask) {
        dispatch({ type: "prepTask/upsert", task: { ...task, completed: !task.completed } });
        try {
          return await savePrepTask({ completed: !task.completed }, task.id);
        } catch (error) {
          dispatch({ type: "prepTask/upsert", task });
          throw error;
        }
      },

      async deletePrepTask(id: ID) {
        await api(path(`/preparation-tasks/${id}`), { method: "DELETE" });
        dispatch({ type: "prepTask/delete", id });
      },

      async saveStarStory(body: In<typeof starStoryCreateSchema> | In<typeof starStoryUpdateSchema>, id?: ID) {
        const s = id
          ? await api<ApiStarStory>(path(`/star-stories/${id}`), { method: "PATCH", body })
          : await api<ApiStarStory>(path("/star-stories"), { method: "POST", body });
        const story = map.toStarStory(s);
        dispatch({ type: "starStory/upsert", story });
        return story;
      },

      async deleteStarStory(id: ID) {
        await api(path(`/star-stories/${id}`), { method: "DELETE" });
        dispatch({ type: "starStory/delete", id });
      },

      async saveQuestion(body: In<typeof questionCreateSchema> | In<typeof questionUpdateSchema>, id?: ID) {
        const q = id
          ? await api<Question>(path(`/questions/${id}`), { method: "PATCH", body })
          : await api<Question>(path("/questions"), { method: "POST", body });
        const question = map.toQuestion(q);
        dispatch({ type: "question/upsert", question });
        return question;
      },

      async deleteQuestion(id: ID) {
        await api(path(`/questions/${id}`), { method: "DELETE" });
        dispatch({ type: "question/delete", id });
      },

      // --- Recordings (upload transport lives in features/recordings/upload.ts) ---------------
      async startRecordingUpload(callId: ID, body: RecordingCreateInput) {
        const res = await api<RecordingUploadResponse>(path(`/calls/${callId}/recordings`), { method: "POST", body });
        dispatch({ type: "recording/upsert", recording: map.toRecording(res.recording) });
        return res;
      },

      async renewRecordingUpload(id: ID) {
        return api<RecordingUploadResponse>(path(`/recordings/${id}/upload-url`), { method: "POST" });
      },

      async completeRecordingUpload(id: ID, durationSeconds?: number) {
        try {
          const r = await api<Recording>(path(`/recordings/${id}/complete`), {
            method: "POST",
            body: durationSeconds !== undefined ? { durationSeconds } : {},
          });
          const recording = map.toRecording(r);
          dispatch({ type: "recording/upsert", recording });
          return recording;
        } finally {
          // A failed verification changes the recording's status server-side.
          void refresh([{ table: "recordings", id }]);
        }
      },

      async getPlaybackUrl(id: ID) {
        return api<RecordingPlayback>(path(`/recordings/${id}/playback-url`));
      },

      async setRecordingDuration(id: ID, durationSeconds: number) {
        const r = await api<Recording>(path(`/recordings/${id}`), { method: "PATCH", body: { durationSeconds } });
        dispatch({ type: "recording/upsert", recording: map.toRecording(r) });
      },

      async deleteRecording(id: ID) {
        await api(path(`/recordings/${id}`), { method: "DELETE" });
        dispatch({ type: "recording/remove", id });
      },

      // --- Collaboration ----------------------------------------------------------------
      async inviteCollaborator(email: string, role: CollaboratorRole) {
        const created = await api<InvitationCreated>(path("/invitations"), { method: "POST", body: { email, role } });
        void refresh([{ table: "workspace_members", id: "" }]);
        return created;
      },

      async revokeInvitation(id: ID) {
        await api(path(`/invitations/${id}`), { method: "DELETE" });
        dispatch({ type: "collaborator/remove", id });
      },

      async setMemberRole(userId: ID, role: CollaboratorRole) {
        await api<Member>(path(`/members/${userId}`), { method: "PATCH", body: { role } });
        void refresh([{ table: "workspace_members", id: userId }]);
      },

      async removeMember(userId: ID) {
        await api(path(`/members/${userId}`), { method: "DELETE" });
        dispatch({ type: "collaborator/remove", id: userId });
      },

      /** Leaves the active workspace and switches to another one. */
      async leaveWorkspace() {
        await api(path(`/members/${data.currentUser.id}`), { method: "DELETE" });
        await refreshWorkspaces();
      },

      /** Creates or updates a note. Updates send the base version; a stale one throws 409 with `current`. */
      async saveNote(input: { title: string; body: string; opportunityId?: ID | null; id?: ID; version?: number }) {
        const n = input.id
          ? await api<ApiNote>(path(`/notes/${input.id}`), {
              method: "PATCH",
              body: { title: input.title, body: input.body, opportunityId: input.opportunityId ?? null, version: input.version },
            })
          : await api<ApiNote>(path("/notes"), {
              method: "POST",
              body: { title: input.title, body: input.body, opportunityId: input.opportunityId ?? null },
            });
        return applyNote(n);
      },

      applyNote,

      async deleteNote(id: ID) {
        await api(path(`/notes/${id}`), { method: "DELETE" });
        dispatch({ type: "note/delete", id });
      },

      async addComment(noteId: ID, body: string) {
        const c = await api<ApiComment>(path(`/notes/${noteId}/comments`), { method: "POST", body: { body } });
        dispatch({ type: "comment/upsert", comment: map.toComment(c) });
      },

      async editComment(id: ID, body: string) {
        const c = await api<ApiComment>(path(`/comments/${id}`), { method: "PATCH", body: { body } });
        dispatch({ type: "comment/upsert", comment: map.toComment(c) });
      },

      async deleteComment(id: ID) {
        await api(path(`/comments/${id}`), { method: "DELETE" });
        const existing = data.comments.find((c) => c.id === id);
        if (existing) dispatch({ type: "comment/upsert", comment: { ...existing, deleted: true, body: "" } });
      },

      // --- Workspace and profile -----------------------------------------------------------
      async updateWorkspace(body: In<typeof workspaceUpdateSchema>) {
        const w = await api<ApiWorkspace>(path(""), { method: "PATCH", body });
        dispatch({ type: "workspace/update", workspace: map.toWorkspace(w) });
        void refreshWorkspaces();
      },

      async updateProfile(body: { displayName?: string; headline?: string | null }) {
        const me = await api<Me>("/me", { method: "PATCH", body });
        await reload({ silent: true });
        return me;
      },
    };
  }, [workspaceId, data.opportunities, data.followUps, data.comments, data.currentUser.id, dispatch, refresh, refreshWorkspaces, reload]);
}

export type Actions = ReturnType<typeof useActions>;
