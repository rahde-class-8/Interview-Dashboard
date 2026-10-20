/**
 * Domain models for the Recruiter Call + Interview Intelligence Dashboard.
 *
 * Records reference each other by stable string IDs rather than embedding
 * related objects, so they map cleanly onto relational backend tables later.
 * All dates are ISO 8601 strings.
 */

export type ID = string;
export type ISODateString = string;

export interface User {
  id: ID;
  name: string;
  email: string;
  title: string;
}

export interface Workspace {
  id: ID;
  name: string;
  ownerId: ID;
  createdAt: ISODateString;
}

export type CollaboratorRole = "viewer" | "commenter" | "editor";

export interface Collaborator {
  id: ID;
  workspaceId: ID;
  name: string;
  email: string;
  role: CollaboratorRole;
  /** "pending" means the invite exists only in local prototype state. */
  status: "active" | "pending";
  invitedAt: ISODateString;
}

export interface Company {
  id: ID;
  name: string;
  industry: string;
  headquarters: string;
  website?: string;
}

export interface Recruiter {
  id: ID;
  name: string;
  email: string;
  phone: string;
  /** Agency name for third-party recruiters; omitted for in-house recruiters. */
  agency?: string;
  /** The company the recruiter primarily hires for. */
  companyId: ID;
}

export const OPPORTUNITY_STAGES = [
  "new",
  "recruiter_screen",
  "technical",
  "hiring_manager",
  "offer",
  "closed",
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export type WorkMode = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "contract" | "contract_to_hire" | "part_time";

export interface CompensationRange {
  min: number;
  max: number;
  currency: string;
  period: "year" | "hour";
}

export interface Opportunity {
  id: ID;
  companyId: ID;
  recruiterId: ID;
  title: string;
  location: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  compensation?: CompensationRange;
  stage: OpportunityStage;
  jobDescription: string;
  requiredSkills: string[];
  preferredSkills: string[];
  /** Free-form interview notes kept on the preparation workspace. */
  prepNotes: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CandidateQuestion {
  id: ID;
  question: string;
  answer: string;
}

export interface RecruiterCall {
  id: ID;
  opportunityId: ID;
  recruiterId: ID;
  callDateTime: ISODateString;
  durationMinutes: number;
  hiringManagerPriorities: string[];
  interviewStages: string[];
  recruiterAdvice: string;
  technicalTopics: string[];
  behavioralThemes: string[];
  candidateQuestions: CandidateQuestion[];
  redFlags: string[];
  /** 1–10 */
  interestLevel: number;
  notes: string;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * Metadata for a recording created by an external app and attached by the user.
 * In the prototype the binary lives only in browser memory ("local-preview").
 */
export interface RecordingAttachment {
  id: ID;
  callId: ID;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  durationSeconds?: number;
  storage: "local-preview" | "remote";
  /** Populated once a backend stores the file. */
  remoteUrl?: string;
  addedAt: ISODateString;
}

export type InterviewStatus = "scheduled" | "completed" | "cancelled" | "rescheduled";
export type InterviewOutcome = "pending" | "advanced" | "rejected" | "offer";
export type InterviewFormat = "video" | "phone" | "onsite";

export interface Interview {
  id: ID;
  opportunityId: ID;
  title: string;
  stage: Exclude<OpportunityStage, "new" | "closed">;
  scheduledAt: ISODateString;
  durationMinutes: number;
  format: InterviewFormat;
  interviewers: string[];
  status: InterviewStatus;
  outcome: InterviewOutcome;
  notes: string;
}

export interface FollowUpTask {
  id: ID;
  opportunityId: ID;
  /** Set when the follow-up originated from a recruiter call. */
  callId?: ID;
  title: string;
  dueDate: ISODateString;
  completed: boolean;
  completedAt?: ISODateString;
}

export type PreparationCategory = "technical" | "behavioral" | "research" | "logistics";

export interface PreparationTask {
  id: ID;
  opportunityId: ID;
  title: string;
  category: PreparationCategory;
  dueDate?: ISODateString;
  completed: boolean;
}

export interface StarStory {
  id: ID;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  themes: string[];
}

export type QuestionType = "technical" | "behavioral";
export type QuestionDifficulty = "easy" | "medium" | "hard";

export interface InterviewQuestion {
  id: ID;
  type: QuestionType;
  topic: string;
  /** Present for company-specific questions. */
  companyId?: ID;
  difficulty: QuestionDifficulty;
  question: string;
  answerNotes: string;
}

export interface SharedNote {
  id: ID;
  workspaceId: ID;
  title: string;
  body: string;
  opportunityId?: ID;
  updatedAt: ISODateString;
  updatedBy: string;
}

export interface Comment {
  id: ID;
  workspaceId: ID;
  noteId: ID;
  authorName: string;
  body: string;
  createdAt: ISODateString;
}

export interface ActivityEvent {
  id: ID;
  workspaceId: ID;
  actorName: string;
  description: string;
  createdAt: ISODateString;
}

/** The full client-side dataset; mirrors what a backend would return. */
export interface AppData {
  currentUser: User;
  workspace: Workspace;
  collaborators: Collaborator[];
  companies: Company[];
  recruiters: Recruiter[];
  opportunities: Opportunity[];
  calls: RecruiterCall[];
  recordings: RecordingAttachment[];
  interviews: Interview[];
  followUps: FollowUpTask[];
  preparationTasks: PreparationTask[];
  starStories: StarStory[];
  questions: InterviewQuestion[];
  sharedNotes: SharedNote[];
  comments: Comment[];
  activity: ActivityEvent[];
}
