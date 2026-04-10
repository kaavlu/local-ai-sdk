export type UseCaseType =
  | 'text_generation'
  | 'text_classification'
  | 'image_classification'
  | 'vision_language'
  | 'embeddings'
  | 'speech_audio'
  | 'custom'

export type StrategyPreset = 'local_first' | 'balanced' | 'cloud_first'

export type ProjectStatus = 'draft' | 'active'

export interface Profile {
  id: string
  full_name: string | null
  use_type: string | null
  created_at: string
  updated_at: string
}

export interface Workspace {
  id: string
  owner_user_id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  workspace_id: string
  name: string
  description: string | null
  use_case_type: UseCaseType
  strategy_preset: StrategyPreset
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export interface ProjectConfig {
  id: string
  project_id: string
  local_model: string | null
  cloud_model: string | null
  battery_min_percent: number | null
  idle_min_seconds: number | null
  requires_charging: boolean
  wifi_only: boolean
  created_at: string
  updated_at: string
}

export interface CreateProjectInput {
  workspaceId: string
  name: string
  description?: string | null
  useCaseType: UseCaseType
  strategyPreset: StrategyPreset
}

export type UpdateProjectConfigInput = Partial<
  Pick<
    ProjectConfig,
    | 'local_model'
    | 'cloud_model'
    | 'battery_min_percent'
    | 'idle_min_seconds'
    | 'requires_charging'
    | 'wifi_only'
  >
>

export type UpdateProfileInput = Partial<Pick<Profile, 'full_name' | 'use_type'>>

export type UpdateWorkspaceInput = Partial<Pick<Workspace, 'name'>>
