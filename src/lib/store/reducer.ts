import type {
  ActivityEvent,
  AppData,
  Collaborator,
  Comment,
  Company,
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
  Workspace,
} from "@/types";

/**
 * State transitions applied after successful API calls and Realtime refreshes.
 * The server is the source of truth: actions carry records returned by the API.
 */
export type AppAction =
  | { type: "reset"; data: AppData }
  | { type: "workspace/update"; workspace: Workspace }
  | { type: "company/upsert"; company: Company }
  | { type: "company/delete"; id: ID }
  | { type: "recruiter/upsert"; recruiter: Recruiter }
  | { type: "recruiter/delete"; id: ID }
  | { type: "opportunity/upsert"; opportunity: Opportunity }
  | { type: "opportunity/setStage"; id: ID; stage: OpportunityStage; at: string }
  | { type: "opportunity/delete"; id: ID }
  | { type: "call/upsert"; call: RecruiterCall }
  | { type: "call/delete"; id: ID }
  | { type: "recording/upsert"; recording: RecordingAttachment }
  | { type: "recording/remove"; id: ID }
  | { type: "followUp/upsert"; task: FollowUpTask }
  | { type: "followUp/delete"; id: ID }

  | { type: "interview/upsert"; interview: Interview }
  | { type: "interview/delete"; id: ID }
  | { type: "prepTask/upsert"; task: PreparationTask }
  | { type: "prepTask/delete"; id: ID }

  | { type: "starStory/upsert"; story: StarStory }
  | { type: "starStory/delete"; id: ID }
  | { type: "question/upsert"; question: InterviewQuestion }
  | { type: "question/delete"; id: ID }
  | { type: "collaborator/replaceAll"; collaborators: Collaborator[] }
  | { type: "collaborator/remove"; id: ID }
  | { type: "note/upsert"; note: SharedNote }
  | { type: "note/delete"; id: ID }
  | { type: "comment/upsert"; comment: Comment }
  | { type: "comment/replaceAll"; comments: Comment[] }
  | { type: "activity/replaceAll"; activity: ActivityEvent[] };

function upsert<T extends { id: ID }>(list: T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [item, ...list];
  const next = list.slice();
  next[index] = item;
  return next;
}

function without<T extends { id: ID }>(list: T[], id: ID): T[] {
  return list.filter((x) => x.id !== id);
}

export function appReducer(state: AppData, action: AppAction): AppData {
  switch (action.type) {
    case "reset":
      return action.data;
    case "workspace/update":
      return { ...state, workspace: action.workspace };
    case "company/upsert":
      return { ...state, companies: upsert(state.companies, action.company) };
    case "company/delete":
      return { ...state, companies: without(state.companies, action.id) };
    case "recruiter/upsert":
      return { ...state, recruiters: upsert(state.recruiters, action.recruiter) };
    case "recruiter/delete":
      return {
        ...state,
        recruiters: without(state.recruiters, action.id),
        opportunities: state.opportunities.map((o) => (o.recruiterId === action.id ? { ...o, recruiterId: undefined } : o)),
        calls: state.calls.map((c) => (c.recruiterId === action.id ? { ...c, recruiterId: undefined } : c)),
      };
    case "opportunity/upsert":
      return { ...state, opportunities: upsert(state.opportunities, action.opportunity) };
    case "opportunity/setStage":
      return {
        ...state,
        opportunities: state.opportunities.map((o) =>
          o.id === action.id ? { ...o, stage: action.stage, updatedAt: action.at } : o,
        ),
      };
    case "opportunity/delete": {
      // Cascade to records that cannot exist without the opportunity.
      const callIds = new Set(
        state.calls.filter((c) => c.opportunityId === action.id).map((c) => c.id),
      );
      return {
        ...state,
        opportunities: without(state.opportunities, action.id),
        calls: state.calls.filter((c) => !callIds.has(c.id)),
        recordings: state.recordings.filter((r) => !callIds.has(r.callId)),
        interviews: state.interviews.filter((i) => i.opportunityId !== action.id),
        followUps: state.followUps.filter((f) => f.opportunityId !== action.id),
        preparationTasks: state.preparationTasks.filter((t) => t.opportunityId !== action.id),
      };
    }
    case "call/upsert":
      return { ...state, calls: upsert(state.calls, action.call) };
    case "call/delete":
      return {
        ...state,
        calls: without(state.calls, action.id),
        recordings: state.recordings.filter((r) => r.callId !== action.id),
        followUps: state.followUps.filter((f) => f.callId !== action.id),
      };
    case "recording/upsert":
      return { ...state, recordings: upsert(state.recordings, action.recording) };
    case "recording/remove":
      return { ...state, recordings: without(state.recordings, action.id) };
    case "followUp/upsert":
      return { ...state, followUps: upsert(state.followUps, action.task) };
    case "followUp/delete":
      return { ...state, followUps: without(state.followUps, action.id) };
    case "interview/upsert":
      return { ...state, interviews: upsert(state.interviews, action.interview) };
    case "interview/delete":
      return { ...state, interviews: without(state.interviews, action.id) };
    case "prepTask/upsert":
      return { ...state, preparationTasks: upsert(state.preparationTasks, action.task) };
    case "prepTask/delete":
      return { ...state, preparationTasks: without(state.preparationTasks, action.id) };
    case "starStory/upsert":
      return { ...state, starStories: upsert(state.starStories, action.story) };
    case "starStory/delete":
      return { ...state, starStories: without(state.starStories, action.id) };
    case "question/upsert":
      return { ...state, questions: upsert(state.questions, action.question) };
    case "question/delete":
      return { ...state, questions: without(state.questions, action.id) };
    case "collaborator/replaceAll":
      return { ...state, collaborators: action.collaborators };
    case "collaborator/remove":
      return { ...state, collaborators: without(state.collaborators, action.id) };
    case "note/upsert":
      return { ...state, sharedNotes: upsert(state.sharedNotes, action.note) };
    case "note/delete":
      return {
        ...state,
        sharedNotes: without(state.sharedNotes, action.id),
        comments: state.comments.filter((c) => c.noteId !== action.id),
      };
    case "comment/upsert": {
      // Threads read oldest first, so new comments go to the end.
      const exists = state.comments.some((c) => c.id === action.comment.id);
      return {
        ...state,
        comments: exists
          ? state.comments.map((c) => (c.id === action.comment.id ? action.comment : c))
          : [...state.comments, action.comment],
      };
    }
    case "comment/replaceAll":
      return { ...state, comments: action.comments };
    case "activity/replaceAll":
      return { ...state, activity: action.activity };
    default:
      return state;
  }
}
