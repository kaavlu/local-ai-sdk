import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  CreateProjectApiKeyResult,
  CreateProjectInput,
  Profile,
  ProjectApiKeyListItem,
  ProjectRequestExecution,
  ProjectValueSummaryExecution,
  Project,
  ProjectConfig,
  RequestExecutionPath,
  RequestExecutionStatus,
  ProjectStatus,
  StrategyPreset,
  UpstreamProviderType,
  UpdateProfileInput,
  UpdateProjectConfigInput,
  UpdateWorkspaceInput,
  UseCaseType,
  Workspace,
} from '@/lib/data/dashboard-types'
import { generateApiKey, hashApiKey } from '@/lib/server/api-keys'
import { encryptSecret } from '@/lib/server/secrets'

// Example (server page/action): const workspace = await getCurrentWorkspace()
function formatError(context: string, message: string) {
  return new Error(`${context}: ${message}`)
}

function ensureNonEmptyPatch(context: string, patch: Record<string, unknown>) {
  if (Object.keys(patch).length === 0) {
    throw new Error(`${context}: no fields provided`)
  }
}

const UPSTREAM_PROVIDER_TYPES: ReadonlySet<UpstreamProviderType> = new Set(['openai_compatible'])

type ProjectConfigRow = {
  id: string
  project_id: string
  local_model: string | null
  cloud_model: string | null
  logical_model: string
  upstream_provider_type: UpstreamProviderType
  upstream_base_url: string | null
  upstream_model: string | null
  fallback_enabled: boolean
  upstream_api_key_encrypted: string | null
  upstream_api_key_last_updated_at: string | null
  battery_min_percent: number | null
  idle_min_seconds: number | null
  estimated_cloud_cost_per_request_usd: number | string | null
  requires_charging: boolean
  wifi_only: boolean
  created_at: string
  updated_at: string
}

type UpdateProjectConfigDbPatch = UpdateProjectConfigInput & {
  upstream_api_key_encrypted?: string | null
  upstream_api_key_last_updated_at?: string | null
}

type ProjectApiKeyRow = {
  id: string
  project_id: string
  label: string | null
  key_prefix: string
  created_at: string
  revoked_at: string | null
  last_used_at: string | null
}

type RequestExecutionRow = {
  id: string
  project_id: string
  api_key_id: string | null
  endpoint: string
  use_case: string | null
  logical_model: string | null
  execution_path: string | null
  execution_reason: string | null
  status: string
  http_status: number | null
  latency_ms: number | null
  input_count: number | null
  error_type: string | null
  error_code: string | null
  request_id: string | null
  created_at: string
}

type ValueSummaryExecutionRow = {
  project_id: string
  status: string
  execution_path: string | null
  execution_reason: string | null
  error_type: string | null
  error_code: string | null
  created_at: string
}

interface RecordProjectRequestExecutionInput {
  projectId: string
  endpoint: string
  useCase: string | null
  logicalModel: string | null
  executionPath: RequestExecutionPath | null
  executionReason: string | null
  status: RequestExecutionStatus
  httpStatus: number | null
  latencyMs: number | null
  inputCount: number | null
  errorType: string | null
  errorCode: string | null
  requestId: string | null
}

function toNullableNonEmptyString(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toNullableNumber(value: number | string | null | undefined): number | null {
  if (value == null) {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isValidAbsoluteUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function getDefaultLogicalModelForUseCase(useCaseType: UseCaseType): string {
  return useCaseType === 'text_generation' ? 'dyno-chat-1' : 'dyno-embeddings-1'
}

function mapProjectConfigRow(row: ProjectConfigRow): ProjectConfig {
  return {
    id: row.id,
    project_id: row.project_id,
    local_model: row.local_model,
    cloud_model: row.cloud_model,
    logical_model: row.logical_model,
    upstream_provider_type: row.upstream_provider_type,
    upstream_base_url: row.upstream_base_url,
    upstream_model: row.upstream_model,
    fallback_enabled: row.fallback_enabled,
    upstream_api_key_configured: Boolean(row.upstream_api_key_encrypted),
    upstream_api_key_last_updated_at: row.upstream_api_key_last_updated_at,
    battery_min_percent: row.battery_min_percent,
    idle_min_seconds: row.idle_min_seconds,
    estimated_cloud_cost_per_request_usd: toNullableNumber(row.estimated_cloud_cost_per_request_usd),
    requires_charging: row.requires_charging,
    wifi_only: row.wifi_only,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function mapProjectApiKeyRow(row: ProjectApiKeyRow): ProjectApiKeyListItem {
  return {
    id: row.id,
    project_id: row.project_id,
    label: row.label,
    key_prefix: row.key_prefix,
    created_at: row.created_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
  }
}

function normalizeRequestExecutionPath(path: string | null): RequestExecutionPath | null {
  return path === 'local' || path === 'cloud' || path === 'unknown' ? path : null
}

function normalizeRequestExecutionStatus(status: string): RequestExecutionStatus {
  return status === 'error' ? 'error' : 'success'
}

function mapRequestExecutionRow(row: RequestExecutionRow): ProjectRequestExecution {
  return {
    id: row.id,
    project_id: row.project_id,
    api_key_id: row.api_key_id,
    api_key_label: null,
    endpoint: row.endpoint,
    use_case: row.use_case,
    logical_model: row.logical_model,
    execution_path: normalizeRequestExecutionPath(row.execution_path),
    execution_reason: row.execution_reason,
    status: normalizeRequestExecutionStatus(row.status),
    http_status: row.http_status,
    latency_ms: row.latency_ms,
    input_count: row.input_count,
    error_type: row.error_type,
    error_code: row.error_code,
    request_id: row.request_id,
    created_at: row.created_at,
  }
}

function mapValueSummaryExecutionRow(row: ValueSummaryExecutionRow): ProjectValueSummaryExecution {
  return {
    project_id: row.project_id,
    status: normalizeRequestExecutionStatus(row.status),
    execution_path: normalizeRequestExecutionPath(row.execution_path),
    execution_reason: row.execution_reason,
    error_type: row.error_type,
    error_code: row.error_code,
    created_at: row.created_at,
  }
}

async function getAuthedSupabase() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw formatError('Authentication failed', error.message)
  }

  if (!user) {
    throw new Error('Not authenticated')
  }

  return { supabase, user }
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const { supabase, user } = await getAuthedSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, use_type, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw formatError('Failed to fetch current profile', error.message)
  }

  return (data as Profile | null) ?? null
}

export async function getCurrentWorkspace(): Promise<Workspace | null> {
  const { supabase, user } = await getAuthedSupabase()
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, owner_user_id, name, slug, created_at, updated_at')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw formatError('Failed to fetch current workspace', error.message)
  }

  return (data as Workspace | null) ?? null
}

export async function listProjects(workspaceId: string): Promise<Project[]> {
  const { supabase } = await getAuthedSupabase()
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, workspace_id, name, description, use_case_type, strategy_preset, status, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw formatError('Failed to list projects', error.message)
  }

  return (data as Project[]) ?? []
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const { supabase } = await getAuthedSupabase()
  const { data, error } = await supabase.rpc('create_project_with_default_config', {
    p_workspace_id: input.workspaceId,
    p_name: input.name,
    p_description: input.description ?? null,
    p_use_case_type: input.useCaseType,
    p_strategy_preset: input.strategyPreset,
  })

  if (error) {
    throw formatError('Failed to create project', error.message)
  }

  const projectId = data as string | null
  if (!projectId) {
    throw new Error('Failed to create project: RPC did not return a project id')
  }

  const defaultLogicalModel = getDefaultLogicalModelForUseCase(input.useCaseType)
  const { error: configUpdateError } = await supabase
    .from('project_configs')
    .update({ logical_model: defaultLogicalModel })
    .eq('project_id', projectId)
  if (configUpdateError) {
    throw formatError('Failed to create project', configUpdateError.message)
  }

  // Guardrail: ensure newly created projects always start as drafts.
  await updateProjectStatus(projectId, 'draft')

  const createdProject = await getProjectById(projectId)
  if (!createdProject) {
    throw new Error('Failed to create project: created project could not be fetched')
  }

  return createdProject
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const { supabase } = await getAuthedSupabase()
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, workspace_id, name, description, use_case_type, strategy_preset, status, created_at, updated_at',
    )
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    throw formatError('Failed to fetch project', error.message)
  }

  return (data as Project | null) ?? null
}

export async function getProjectConfig(projectId: string): Promise<ProjectConfig | null> {
  const { supabase } = await getAuthedSupabase()
  const { data, error } = await supabase
    .from('project_configs')
    .select(
      'id, project_id, local_model, cloud_model, logical_model, upstream_provider_type, upstream_base_url, upstream_model, fallback_enabled, upstream_api_key_encrypted, upstream_api_key_last_updated_at, battery_min_percent, idle_min_seconds, estimated_cloud_cost_per_request_usd, requires_charging, wifi_only, created_at, updated_at',
    )
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    throw formatError('Failed to fetch project config', error.message)
  }

  return data ? mapProjectConfigRow(data as ProjectConfigRow) : null
}

export async function listProjectApiKeys(projectId: string): Promise<ProjectApiKeyListItem[]> {
  const { supabase } = await getAuthedSupabase()
  const { data, error } = await supabase
    .from('project_api_keys')
    .select('id, project_id, label, key_prefix, created_at, revoked_at, last_used_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    throw formatError('Failed to list project API keys', error.message)
  }

  return ((data as ProjectApiKeyRow[] | null) ?? []).map(mapProjectApiKeyRow)
}

export async function listRecentProjectRequestExecutions(
  projectId: string,
  limit = 20,
): Promise<ProjectRequestExecution[]> {
  const { supabase } = await getAuthedSupabase()
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 100) : 20
  const { data, error } = await supabase
    .from('request_executions')
    .select(
      'id, project_id, api_key_id, endpoint, use_case, logical_model, execution_path, execution_reason, status, http_status, latency_ms, input_count, error_type, error_code, request_id, created_at',
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) {
    // Gracefully handle environments where Phase 2C migration is not applied yet.
    if (
      error.code === 'PGRST205' ||
      error.message.includes("Could not find the table 'public.request_executions'")
    ) {
      return []
    }
    throw formatError('Failed to list recent project requests', error.message)
  }

  return ((data as RequestExecutionRow[] | null) ?? []).map(mapRequestExecutionRow)
}

export async function listProjectValueSummaryExecutions(
  projectId: string,
  windowDays = 7,
): Promise<ProjectValueSummaryExecution[]> {
  const { supabase } = await getAuthedSupabase()
  const effectiveWindowDays = Number.isFinite(windowDays) && windowDays > 0 ? Math.floor(windowDays) : 7
  const windowStart = new Date(Date.now() - effectiveWindowDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('request_executions')
    .select('project_id, status, execution_path, execution_reason, error_type, error_code, created_at')
    .eq('project_id', projectId)
    .gte('created_at', windowStart)

  if (error) {
    if (
      error.code === 'PGRST205' ||
      error.message.includes("Could not find the table 'public.request_executions'")
    ) {
      return []
    }
    throw formatError('Failed to list value summary request executions', error.message)
  }

  return ((data as ValueSummaryExecutionRow[] | null) ?? []).map(mapValueSummaryExecutionRow)
}

export async function recordProjectRequestExecution(
  input: RecordProjectRequestExecutionInput,
): Promise<void> {
  const { supabase } = await getAuthedSupabase()
  const adminSupabase = createAdminClient()

  const [projectCheck, tableCheck] = await Promise.all([
    supabase.from('projects').select('id').eq('id', input.projectId).maybeSingle(),
    adminSupabase.from('request_executions').select('id').limit(1),
  ])
  if (projectCheck.error) {
    throw formatError('Failed to verify project access', projectCheck.error.message)
  }
  if (!projectCheck.data) {
    throw new Error('Failed to record request execution: project not found or access denied')
  }
  if (tableCheck.error) {
    if (
      tableCheck.error.code === 'PGRST205' ||
      tableCheck.error.message.includes("Could not find the table 'public.request_executions'")
    ) {
      return
    }
    throw formatError('Failed to verify request execution table', tableCheck.error.message)
  }

  if (input.requestId) {
    const { data: existing, error: existingError } = await adminSupabase
      .from('request_executions')
      .select('id')
      .eq('project_id', input.projectId)
      .eq('request_id', input.requestId)
      .limit(1)
    if (existingError) {
      if (
        existingError.code === 'PGRST205' ||
        existingError.message.includes("Could not find the table 'public.request_executions'")
      ) {
        return
      }
      throw formatError('Failed to query existing request execution', existingError.message)
    }
    if ((existing ?? []).length > 0) {
      return
    }
  }

  const { error } = await adminSupabase.from('request_executions').insert({
    project_id: input.projectId,
    api_key_id: null,
    endpoint: input.endpoint,
    use_case: input.useCase,
    logical_model: input.logicalModel,
    execution_path: input.executionPath,
    execution_reason: input.executionReason,
    status: input.status,
    http_status: input.httpStatus,
    latency_ms: input.latencyMs,
    input_count: input.inputCount,
    error_type: input.errorType,
    error_code: input.errorCode,
    request_id: input.requestId,
  })

  if (error) {
    if (
      error.code === 'PGRST205' ||
      error.message.includes("Could not find the table 'public.request_executions'")
    ) {
      return
    }
    throw formatError('Failed to record request execution', error.message)
  }
}

export async function createProjectApiKey(
  projectId: string,
  label?: string | null,
): Promise<CreateProjectApiKeyResult> {
  const { supabase } = await getAuthedSupabase()
  const { plaintextKey, keyPrefix } = generateApiKey()
  const normalizedLabel = toNullableNonEmptyString(label)

  const { data, error } = await supabase
    .from('project_api_keys')
    .insert({
      project_id: projectId,
      label: normalizedLabel,
      key_prefix: keyPrefix,
      key_hash: hashApiKey(plaintextKey),
    })
    .select('id, project_id, label, key_prefix, created_at, revoked_at, last_used_at')
    .single()

  if (error) {
    throw formatError('Failed to create project API key', error.message)
  }

  return {
    apiKey: plaintextKey,
    key: mapProjectApiKeyRow(data as ProjectApiKeyRow),
  }
}

export async function revokeProjectApiKey(projectId: string, keyId: string): Promise<void> {
  const { supabase } = await getAuthedSupabase()
  const { error } = await supabase
    .from('project_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', keyId)
    .eq('project_id', projectId)
    .is('revoked_at', null)

  if (error) {
    throw formatError('Failed to revoke project API key', error.message)
  }
}

export async function deleteProject(projectId: string): Promise<void> {
  const { supabase } = await getAuthedSupabase()
  const { error } = await supabase.from('projects').delete().eq('id', projectId)

  if (error) {
    throw formatError('Failed to delete project', error.message)
  }
}

export async function updateProjectConfig(
  projectId: string,
  patch: UpdateProjectConfigInput,
): Promise<ProjectConfig> {
  const { supabase } = await getAuthedSupabase()
  const { data: existingData, error: existingError } = await supabase
    .from('project_configs')
    .select(
      'id, project_id, local_model, cloud_model, logical_model, upstream_provider_type, upstream_base_url, upstream_model, fallback_enabled, upstream_api_key_encrypted, upstream_api_key_last_updated_at, battery_min_percent, idle_min_seconds, estimated_cloud_cost_per_request_usd, requires_charging, wifi_only, created_at, updated_at',
    )
    .eq('project_id', projectId)
    .single()

  if (existingError) {
    throw formatError('Failed to update project config', existingError.message)
  }

  const existing = existingData as ProjectConfigRow
  const payload: UpdateProjectConfigDbPatch = {}

  if (patch.local_model !== undefined) payload.local_model = patch.local_model
  if (patch.cloud_model !== undefined) payload.cloud_model = toNullableNonEmptyString(patch.cloud_model)
  if (patch.logical_model !== undefined) payload.logical_model = patch.logical_model.trim()
  if (patch.upstream_provider_type !== undefined) {
    payload.upstream_provider_type = patch.upstream_provider_type
  }
  if (patch.upstream_base_url !== undefined) {
    payload.upstream_base_url = toNullableNonEmptyString(patch.upstream_base_url)
  }
  if (patch.upstream_model !== undefined) {
    payload.upstream_model = toNullableNonEmptyString(patch.upstream_model)
  }
  if (patch.fallback_enabled !== undefined) {
    payload.fallback_enabled = patch.fallback_enabled
  }
  if (patch.battery_min_percent !== undefined) {
    payload.battery_min_percent = patch.battery_min_percent
  }
  if (patch.idle_min_seconds !== undefined) payload.idle_min_seconds = patch.idle_min_seconds
  if (patch.estimated_cloud_cost_per_request_usd !== undefined) {
    payload.estimated_cloud_cost_per_request_usd = patch.estimated_cloud_cost_per_request_usd
  }
  if (patch.requires_charging !== undefined) {
    payload.requires_charging = patch.requires_charging
  }
  if (patch.wifi_only !== undefined) payload.wifi_only = patch.wifi_only

  if (payload.logical_model !== undefined && !payload.logical_model) {
    throw new Error('Failed to update project config: logical model is required')
  }
  if (
    payload.upstream_provider_type !== undefined &&
    !UPSTREAM_PROVIDER_TYPES.has(payload.upstream_provider_type)
  ) {
    throw new Error('Failed to update project config: unsupported upstream provider type')
  }
  if (payload.upstream_base_url !== undefined && payload.upstream_base_url !== null) {
    if (!isValidAbsoluteUrl(payload.upstream_base_url)) {
      throw new Error('Failed to update project config: upstream base URL must be a valid http(s) URL')
    }
  }
  if (payload.upstream_model !== undefined && payload.upstream_model !== null && !payload.upstream_model) {
    throw new Error('Failed to update project config: upstream model cannot be empty')
  }
  if (
    payload.estimated_cloud_cost_per_request_usd !== undefined &&
    payload.estimated_cloud_cost_per_request_usd !== null &&
    (!Number.isFinite(payload.estimated_cloud_cost_per_request_usd) ||
      payload.estimated_cloud_cost_per_request_usd < 0)
  ) {
    throw new Error(
      'Failed to update project config: estimated cloud cost per request must be a number greater than or equal to 0',
    )
  }

  const plaintextApiKey = toNullableNonEmptyString(patch.upstream_api_key_plaintext)
  if (plaintextApiKey) {
    payload.upstream_api_key_encrypted = encryptSecret(plaintextApiKey)
    payload.upstream_api_key_last_updated_at = new Date().toISOString()
  }

  const effectiveFallbackEnabled = payload.fallback_enabled ?? existing.fallback_enabled
  const effectiveUpstreamProviderType = payload.upstream_provider_type ?? existing.upstream_provider_type
  const effectiveUpstreamBaseUrl = payload.upstream_base_url ?? existing.upstream_base_url
  const effectiveUpstreamModel =
    payload.upstream_model ?? payload.cloud_model ?? existing.upstream_model ?? existing.cloud_model
  const effectiveEncryptedApiKey = payload.upstream_api_key_encrypted ?? existing.upstream_api_key_encrypted

  if (!UPSTREAM_PROVIDER_TYPES.has(effectiveUpstreamProviderType)) {
    throw new Error('Failed to update project config: unsupported upstream provider type')
  }
  if (effectiveFallbackEnabled) {
    if (!effectiveUpstreamBaseUrl) {
      throw new Error('Failed to update project config: upstream base URL is required when fallback is enabled')
    }
    if (!isValidAbsoluteUrl(effectiveUpstreamBaseUrl)) {
      throw new Error('Failed to update project config: upstream base URL must be a valid http(s) URL')
    }
    if (!effectiveUpstreamModel) {
      throw new Error('Failed to update project config: upstream model is required when fallback is enabled')
    }
    if (!effectiveEncryptedApiKey) {
      throw new Error(
        'Failed to update project config: upstream API key is required when fallback is enabled',
      )
    }
  }

  // Keep canonical field authoritative while preserving temporary compatibility reads.
  if (payload.upstream_model !== undefined) {
    payload.cloud_model = payload.upstream_model
  } else if (payload.cloud_model !== undefined) {
    payload.upstream_model = payload.cloud_model
  }

  ensureNonEmptyPatch('Failed to update project config', payload as Record<string, unknown>)

  const { data, error } = await supabase
    .from('project_configs')
    .update(payload)
    .eq('project_id', projectId)
    .select(
      'id, project_id, local_model, cloud_model, logical_model, upstream_provider_type, upstream_base_url, upstream_model, fallback_enabled, upstream_api_key_encrypted, upstream_api_key_last_updated_at, battery_min_percent, idle_min_seconds, estimated_cloud_cost_per_request_usd, requires_charging, wifi_only, created_at, updated_at',
    )
    .single()

  if (error) {
    throw formatError('Failed to update project config', error.message)
  }

  return mapProjectConfigRow(data as ProjectConfigRow)
}

export async function updateProjectStatus(
  projectId: string,
  status: ProjectStatus,
): Promise<Project> {
  const { supabase } = await getAuthedSupabase()
  const { data, error } = await supabase
    .from('projects')
    .update({ status })
    .eq('id', projectId)
    .select('id, workspace_id, name, description, use_case_type, strategy_preset, status, created_at, updated_at')
    .single()

  if (error) {
    throw formatError('Failed to update project status', error.message)
  }

  return data as Project
}

export async function updateProjectStrategyPreset(
  projectId: string,
  strategyPreset: StrategyPreset,
): Promise<Project> {
  const { supabase } = await getAuthedSupabase()
  const { data, error } = await supabase
    .from('projects')
    .update({ strategy_preset: strategyPreset })
    .eq('id', projectId)
    .select('id, workspace_id, name, description, use_case_type, strategy_preset, status, created_at, updated_at')
    .single()

  if (error) {
    throw formatError('Failed to update project strategy preset', error.message)
  }

  return data as Project
}

export async function updateProfile(profilePatch: UpdateProfileInput): Promise<Profile> {
  const { supabase, user } = await getAuthedSupabase()
  const payload: UpdateProfileInput = {}

  if (profilePatch.full_name !== undefined) payload.full_name = profilePatch.full_name
  if (profilePatch.use_type !== undefined) payload.use_type = profilePatch.use_type

  ensureNonEmptyPatch('Failed to update profile', payload as Record<string, unknown>)

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', user.id)
    .select('id, full_name, use_type, created_at, updated_at')
    .single()

  if (error) {
    throw formatError('Failed to update profile', error.message)
  }

  return data as Profile
}

export async function updateWorkspace(
  workspaceId: string,
  workspacePatch: UpdateWorkspaceInput,
): Promise<Workspace> {
  const { supabase } = await getAuthedSupabase()
  const payload: UpdateWorkspaceInput = {}

  if (workspacePatch.name !== undefined) payload.name = workspacePatch.name

  ensureNonEmptyPatch('Failed to update workspace', payload as Record<string, unknown>)

  const { data, error } = await supabase
    .from('workspaces')
    .update(payload)
    .eq('id', workspaceId)
    .select('id, owner_user_id, name, slug, created_at, updated_at')
    .single()

  if (error) {
    throw formatError('Failed to update workspace', error.message)
  }

  return data as Workspace
}
