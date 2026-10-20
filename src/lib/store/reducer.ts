import type {
  ActivityEvent,
  AppData,
  Collaborator,
  CollaboratorRole,
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
} from "@/types";

/**
 * Every action corresponds to a future API mutation. When a backend exists,
 * the provider can call the API first and dispatch these on success.
 */
export type AppAction =
  | { type: "reset"; data: AppData }
  | { type: "company/upsert"; company: Company }
  | { type: "recruiter/upsert"; recruiter: Recruiter }
  | { type: "opportunity/upsert"; opportunity: Opportunity }
  | { type: "opportunity/setStage"; id: ID; stage: OpportunityStage; at: string }
  | { type: "opportunity/delete"; id: ID }
  | { type: "call/upsert"; call: RecruiterCall }
  | { type: "call/delete"; id: ID }
  | { type: "recording/add"; recording: RecordingAttachment }
  | { type: "recording/update"; id: ID; patch: Partial<RecordingAttachment> }
  | { type: "recording/remove"; id: ID }
  | { type: "followUp/upsert"; task: FollowUpTask }
  | { type: "followUp/delete"; id: ID }
  | { type: "followUp/toggle"; id: ID; at: string }
  | { type: "interview/upsert"; interview: Interview }
  | { type: "interview/delete"; id: ID }
  | { type: "prepTask/upsert"; task: PreparationTask }
  | { type: "prepTask/delete"; id: ID }
  | { type: "prepTask/toggle"; id: ID }
  | { type: "starStory/upsert"; story: StarStory }
  | { type: "starStory/delete"; id: ID }
  | { type: "question/upsert"; question: InterviewQuestion }
  | { type: "question/delete"; id: ID }
  | { type: "collaborator/add"; collaborator: Collaborator }
  | { type: "collaborator/setRole"; id: ID; role: CollaboratorRole }
  | { type: "collaborator/remove"; id: ID }
  | { type: "note/upsert"; note: SharedNote }
  | { type: "comment/add"; comment: Comment }
  | { type: "comment/delete"; id: ID }
  | { type: "activity/log"; event: ActivityEvent };

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
    case "company/upsert":
      return { ...state, companies: upsert(state.companies, action.company) };
    case "recruiter/upsert":
      return { ...state, recruiters: upsert(state.recruiters, action.recruiter) };
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
    case "recording/add":
      return { ...state, recordings: [...state.recordings, action.recording] };
    case "recording/update":
      return {
        ...state,
        recordings: state.recordings.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)),
      };
    case "recording/remove":
      return { ...state, recordings: without(state.recordings, action.id) };
    case "followUp/upsert":
      return { ...state, followUps: upsert(state.followUps, action.task) };
    case "followUp/delete":
      return { ...state, followUps: without(state.followUps, action.id) };
    case "followUp/toggle":
      return {
        ...state,
        followUps: state.followUps.map((f) =>
          f.id === action.id
            ? { ...f, completed: !f.completed, completedAt: f.completed ? undefined : action.at }
            : f,
        ),
      };
    case "interview/upsert":
      return { ...state, interviews: upsert(state.interviews, action.interview) };
    case "interview/delete":
      return { ...state, interviews: without(state.interviews, action.id) };
    case "prepTask/upsert":
      return { ...state, preparationTasks: upsert(state.preparationTasks, action.task) };
    case "prepTask/delete":
      return { ...state, preparationTasks: without(state.preparationTasks, action.id) };
    case "prepTask/toggle":
      return {
        ...state,
        preparationTasks: state.preparationTasks.map((t) =>
          t.id === action.id ? { ...t, completed: !t.completed } : t,
        ),
      };
    case "starStory/upsert":
      return { ...state, starStories: upsert(state.starStories, action.story) };
    case "starStory/delete":
      return { ...state, starStories: without(state.starStories, action.id) };
    case "question/upsert":
      return { ...state, questions: upsert(state.questions, action.question) };
    case "question/delete":
      return { ...state, questions: without(state.questions, action.id) };
    case "collaborator/add":
      return { ...state, collaborators: [...state.collaborators, action.collaborator] };
    case "collaborator/setRole":
      return {
        ...state,
        collaborators: state.collaborators.map((c) =>
          c.id === action.id ? { ...c, role: action.role } : c,
        ),
      };
    case "collaborator/remove":
      return { ...state, collaborators: without(state.collaborators, action.id) };
    case "note/upsert":
      return { ...state, sharedNotes: upsert(state.sharedNotes, action.note) };
    case "comment/add":
      return { ...state, comments: [...state.comments, action.comment] };
    case "comment/delete":
      return { ...state, comments: without(state.comments, action.id) };
    case "activity/log":
      return { ...state, activity: [action.event, ...state.activity] };
    default:
      return state;
  }
}
