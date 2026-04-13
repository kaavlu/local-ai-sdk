export type UseCaseType =
  | 'text_generation'
  | 'text_classification'
  | 'image_classification'
  | 'vision_language'
  | 'embeddings'
  | 'speech_audio'
  | 'custom'

export type StrategyPreset = 'local_first' | 'balanced' | 'cloud_first'
export type UpstreamProviderType = 'openai_compatible'

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
  logical_model: string
  upstream_provider_type: UpstreamProviderType
  upstream_base_url: string | null
  upstream_model: string | null
  fallback_enabled: boolean
  upstream_api_key_configured: boolean
  upstream_api_key_last_updated_at: string | null
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
    | 'logical_model'
    | 'upstream_provider_type'
    | 'upstream_base_url'
    | 'upstream_model'
    | 'fallback_enabled'
    | 'battery_min_percent'
    | 'idle_min_seconds'
    | 'requires_charging'
    | 'wifi_only'
  >
> & {
  upstream_api_key_plaintext?: string | null
}

export type UpdateProfileInput = Partial<Pick<Profile, 'full_name' | 'use_type'>>

export type UpdateWorkspaceInput = Partial<Pick<Workspace, 'name'>>

export interface ProjectApiKeyListItem {
  id: string
  project_id: string
  label: string | null
  key_prefix: string
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
}

export interface CreateProjectApiKeyResult {
  apiKey: string
  key: ProjectApiKeyListItem
}

export type RequestExecutionPath = 'local' | 'cloud' | 'unknown'
export type RequestExecutionStatus = 'success' | 'error'

export interface ProjectRequestExecution {
  id: string
  project_id: string
  api_key_id: string | null
  api_key_label: string | null
  endpoint: string
  use_case: string | null
  logical_model: string | null
  execution_path: RequestExecutionPath | null
  execution_reason: string | null
  status: RequestExecutionStatus
  http_status: number | null
  latency_ms: number | null
  input_count: number | null
  error_type: string | null
  error_code: string | null
  request_id: string | null
  created_at: string
}
