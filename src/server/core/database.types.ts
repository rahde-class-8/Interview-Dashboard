
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": string,"metadata": NonNullable<Json>,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"workspace_id": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string | null,"body": string,"created_at": string,"deleted_at": string | null,"edited_at": string | null,"id": string,"note_id": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body": string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"note_id": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"edited_at"?: string | null,"id"?: string,"note_id"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_note_id_workspace_id_fkey"
      columns: ["note_id","workspace_id"]
isOneToOne: false
      referencedRelation: "shared_notes"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"companies": {
                  Row: {
                    "created_at": string,"headquarters": string | null,"id": string,"industry": string | null,"name": string,"updated_at": string,"website": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"headquarters"?: string | null,"id"?: string,"industry"?: string | null,"name": string,"updated_at"?: string,"website"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"headquarters"?: string | null,"id"?: string,"industry"?: string | null,"name"?: string,"updated_at"?: string,"website"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "companies_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"follow_up_tasks": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"created_by": string | null,"due_date": string,"id": string,"opportunity_id": string,"recruiter_call_id": string | null,"title": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_date": string,"id"?: string,"opportunity_id": string,"recruiter_call_id"?: string | null,"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_date"?: string,"id"?: string,"opportunity_id"?: string,"recruiter_call_id"?: string | null,"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "follow_up_tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "follow_up_tasks_opportunity_id_workspace_id_fkey"
      columns: ["opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "follow_up_tasks_recruiter_call_id_workspace_id_fkey"
      columns: ["recruiter_call_id","workspace_id"]
isOneToOne: false
      referencedRelation: "recruiter_calls"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"interviews": {
                  Row: {
                    "created_at": string,"created_by": string | null,"duration_minutes": number,"format": string,"id": string,"interviewers": (string)[],"notes": string,"opportunity_id": string,"outcome": string,"scheduled_at": string,"stage": string,"status": string,"title": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"duration_minutes": number,"format": string,"id"?: string,"interviewers"?: (string)[],"notes"?: string,"opportunity_id": string,"outcome"?: string,"scheduled_at": string,"stage": string,"status"?: string,"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"duration_minutes"?: number,"format"?: string,"id"?: string,"interviewers"?: (string)[],"notes"?: string,"opportunity_id"?: string,"outcome"?: string,"scheduled_at"?: string,"stage"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "interviews_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "interviews_opportunity_id_workspace_id_fkey"
      columns: ["opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"opportunities": {
                  Row: {
                    "comp_currency": string,"comp_max": number | null,"comp_min": number | null,"comp_period": string | null,"company_id": string,"created_at": string,"created_by": string | null,"employment_type": string,"id": string,"job_description": string,"location": string,"preferred_skills": (string)[],"prep_notes": string,"recruiter_id": string | null,"required_skills": (string)[],"stage": string,"stage_changed_at": string,"title": string,"updated_at": string,"work_mode": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comp_currency"?: string,"comp_max"?: number | null,"comp_min"?: number | null,"comp_period"?: string | null,"company_id": string,"created_at"?: string,"created_by"?: string | null,"employment_type": string,"id"?: string,"job_description"?: string,"location"?: string,"preferred_skills"?: (string)[],"prep_notes"?: string,"recruiter_id"?: string | null,"required_skills"?: (string)[],"stage"?: string,"stage_changed_at"?: string,"title": string,"updated_at"?: string,"work_mode": string,"workspace_id": string
                  }
                  Update: {
                    "comp_currency"?: string,"comp_max"?: number | null,"comp_min"?: number | null,"comp_period"?: string | null,"company_id"?: string,"created_at"?: string,"created_by"?: string | null,"employment_type"?: string,"id"?: string,"job_description"?: string,"location"?: string,"preferred_skills"?: (string)[],"prep_notes"?: string,"recruiter_id"?: string | null,"required_skills"?: (string)[],"stage"?: string,"stage_changed_at"?: string,"title"?: string,"updated_at"?: string,"work_mode"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "opportunities_company_id_workspace_id_fkey"
      columns: ["company_id","workspace_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "opportunities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "opportunities_recruiter_id_workspace_id_fkey"
      columns: ["recruiter_id","workspace_id"]
isOneToOne: false
      referencedRelation: "recruiters"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "opportunities_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"preparation_tasks": {
                  Row: {
                    "category": string,"completed_at": string | null,"created_at": string,"created_by": string | null,"due_date": string | null,"id": string,"opportunity_id": string,"title": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"id"?: string,"opportunity_id": string,"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "category"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"due_date"?: string | null,"id"?: string,"opportunity_id"?: string,"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "preparation_tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "preparation_tasks_opportunity_id_workspace_id_fkey"
      columns: ["opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id","workspace_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"email": string,"headline": string | null,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"email": string,"headline"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"email"?: string,"headline"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"questions": {
                  Row: {
                    "answer_notes": string,"company_id": string | null,"created_at": string,"created_by": string | null,"difficulty": string,"id": string,"question": string,"topic": string,"type": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_notes"?: string,"company_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"difficulty": string,"id"?: string,"question": string,"topic": string,"type": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "answer_notes"?: string,"company_id"?: string | null,"created_at"?: string,"created_by"?: string | null,"difficulty"?: string,"id"?: string,"question"?: string,"topic"?: string,"type"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "questions_company_id_workspace_id_fkey"
      columns: ["company_id","workspace_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "questions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "questions_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"recordings": {
                  Row: {
                    "consent_confirmed_at": string,"created_at": string,"delete_after": string | null,"deleted_at": string | null,"duration_seconds": number | null,"failure_reason": string | null,"file_name": string,"file_size": number,"id": string,"mime_type": string,"recruiter_call_id": string,"status": string,"storage_path": string,"updated_at": string,"uploaded_at": string | null,"uploaded_by": string | null,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "consent_confirmed_at": string,"created_at"?: string,"delete_after"?: string | null,"deleted_at"?: string | null,"duration_seconds"?: number | null,"failure_reason"?: string | null,"file_name": string,"file_size": number,"id"?: string,"mime_type": string,"recruiter_call_id": string,"status"?: string,"storage_path": string,"updated_at"?: string,"uploaded_at"?: string | null,"uploaded_by"?: string | null,"workspace_id": string
                  }
                  Update: {
                    "consent_confirmed_at"?: string,"created_at"?: string,"delete_after"?: string | null,"deleted_at"?: string | null,"duration_seconds"?: number | null,"failure_reason"?: string | null,"file_name"?: string,"file_size"?: number,"id"?: string,"mime_type"?: string,"recruiter_call_id"?: string,"status"?: string,"storage_path"?: string,"updated_at"?: string,"uploaded_at"?: string | null,"uploaded_by"?: string | null,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recordings_recruiter_call_id_workspace_id_fkey"
      columns: ["recruiter_call_id","workspace_id"]
isOneToOne: false
      referencedRelation: "recruiter_calls"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "recordings_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"recruiter_calls": {
                  Row: {
                    "behavioral_themes": (string)[],"call_at": string,"candidate_questions": NonNullable<Json>,"created_at": string,"created_by": string | null,"duration_minutes": number,"hiring_manager_priorities": (string)[],"id": string,"interest_level": number,"interview_stages": (string)[],"notes": string,"opportunity_id": string,"recruiter_advice": string,"recruiter_id": string | null,"red_flags": (string)[],"technical_topics": (string)[],"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "behavioral_themes"?: (string)[],"call_at": string,"candidate_questions"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"duration_minutes": number,"hiring_manager_priorities"?: (string)[],"id"?: string,"interest_level": number,"interview_stages"?: (string)[],"notes"?: string,"opportunity_id": string,"recruiter_advice"?: string,"recruiter_id"?: string | null,"red_flags"?: (string)[],"technical_topics"?: (string)[],"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "behavioral_themes"?: (string)[],"call_at"?: string,"candidate_questions"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string | null,"duration_minutes"?: number,"hiring_manager_priorities"?: (string)[],"id"?: string,"interest_level"?: number,"interview_stages"?: (string)[],"notes"?: string,"opportunity_id"?: string,"recruiter_advice"?: string,"recruiter_id"?: string | null,"red_flags"?: (string)[],"technical_topics"?: (string)[],"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recruiter_calls_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recruiter_calls_opportunity_id_workspace_id_fkey"
      columns: ["opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "recruiter_calls_recruiter_id_workspace_id_fkey"
      columns: ["recruiter_id","workspace_id"]
isOneToOne: false
      referencedRelation: "recruiters"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "recruiter_calls_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"recruiters": {
                  Row: {
                    "agency": string | null,"company_id": string | null,"created_at": string,"email": string | null,"id": string,"name": string,"phone": string | null,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agency"?: string | null,"company_id"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name": string,"phone"?: string | null,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "agency"?: string | null,"company_id"?: string | null,"created_at"?: string,"email"?: string | null,"id"?: string,"name"?: string,"phone"?: string | null,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recruiters_company_id_workspace_id_fkey"
      columns: ["company_id","workspace_id"]
isOneToOne: false
      referencedRelation: "companies"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "recruiters_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"shared_notes": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"id": string,"opportunity_id": string | null,"title": string,"updated_at": string,"updated_by": string | null,"version": number,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"opportunity_id"?: string | null,"title": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id": string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"opportunity_id"?: string | null,"title"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "shared_notes_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shared_notes_opportunity_id_workspace_id_fkey"
      columns: ["opportunity_id","workspace_id"]
isOneToOne: false
      referencedRelation: "opportunities"
      referencedColumns: ["id","workspace_id"]
    },{
      foreignKeyName: "shared_notes_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "shared_notes_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"star_stories": {
                  Row: {
                    "action": string,"created_at": string,"created_by": string | null,"id": string,"result": string,"situation": string,"task": string,"themes": (string)[],"title": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"result"?: string,"situation"?: string,"task"?: string,"themes"?: (string)[],"title": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "action"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"result"?: string,"situation"?: string,"task"?: string,"themes"?: (string)[],"title"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "star_stories_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "star_stories_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"storage_cleanup_queue": {
                  Row: {
                    "attempts": number,"bucket": string,"completed_at": string | null,"enqueued_at": string,"id": string,"last_error": string | null,"reason": string,"storage_path": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"bucket": string,"completed_at"?: string | null,"enqueued_at"?: string,"id"?: string,"last_error"?: string | null,"reason": string,"storage_path": string,"workspace_id": string
                  }
                  Update: {
                    "attempts"?: number,"bucket"?: string,"completed_at"?: string | null,"enqueued_at"?: string,"id"?: string,"last_error"?: string | null,"reason"?: string,"storage_path"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"workspace_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"role": string,"status": string,"token_hash": string,"updated_at": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"role": string,"status"?: string,"token_hash": string,"updated_at"?: string,"workspace_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"role"?: string,"status"?: string,"token_hash"?: string,"updated_at"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_invitations_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspace_members": {
                  Row: {
                    "created_at": string,"role": string,"updated_at": string,"user_id": string,"workspace_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"role": string,"updated_at"?: string,"user_id": string,"workspace_id": string
                  }
                  Update: {
                    "created_at"?: string,"role"?: string,"updated_at"?: string,"user_id"?: string,"workspace_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspace_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "workspace_members_workspace_id_fkey"
      columns: ["workspace_id"]
isOneToOne: false
      referencedRelation: "workspaces"
      referencedColumns: ["id"]
    }
                  ]
                },"workspaces": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"owner_id": string,"recording_retention_days": number | null,"storage_quota_bytes": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"owner_id": string,"recording_retention_days"?: number | null,"storage_quota_bytes"?: number,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string,"recording_retention_days"?: number | null,"storage_quota_bytes"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workspaces_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: {
              "role": string,"workspace_id": string
            }[]
                           },
"save_opportunity":
{ Args: { "p_opportunity_id": string,"p_payload": Json,"p_workspace_id": string }; Returns: string
                           },
"save_recruiter_call":
{ Args: { "p_call_id": string,"p_payload": Json,"p_workspace_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
