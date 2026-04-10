import { createClient } from '@/lib/supabase/server'
import type {
  CreateProjectInput,
  Profile,
  Project,
  ProjectConfig,
  ProjectStatus,
  UpdateProfileInput,
  UpdateProjectConfigInput,
  UpdateWorkspaceInput,
  Workspace,
} from '@/lib/data/dashboard-types'

// Example (server page/action): const workspace = await getCurrentWorkspace()
function formatError(context: string, message: string) {
  return new Error(`${context}: ${message}`)
}

function ensureNonEmptyPatch(context: string, patch: Record<string, unknown>) {
  if (Object.keys(patch).length === 0) {
    throw new Error(`${context}: no fields provided`)
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
      'id, project_id, local_model, cloud_model, battery_min_percent, idle_min_seconds, requires_charging, wifi_only, created_at, updated_at',
    )
    .eq('project_id', projectId)
    .maybeSingle()

  if (error) {
    throw formatError('Failed to fetch project config', error.message)
  }

  return (data as ProjectConfig | null) ?? null
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
  const payload: UpdateProjectConfigInput = {}

  if (patch.local_model !== undefined) payload.local_model = patch.local_model
  if (patch.cloud_model !== undefined) payload.cloud_model = patch.cloud_model
  if (patch.battery_min_percent !== undefined) {
    payload.battery_min_percent = patch.battery_min_percent
  }
  if (patch.idle_min_seconds !== undefined) payload.idle_min_seconds = patch.idle_min_seconds
  if (patch.requires_charging !== undefined) {
    payload.requires_charging = patch.requires_charging
  }
  if (patch.wifi_only !== undefined) payload.wifi_only = patch.wifi_only

  ensureNonEmptyPatch('Failed to update project config', payload as Record<string, unknown>)

  const { data, error } = await supabase
    .from('project_configs')
    .update(payload)
    .eq('project_id', projectId)
    .select(
      'id, project_id, local_model, cloud_model, battery_min_percent, idle_min_seconds, requires_charging, wifi_only, created_at, updated_at',
    )
    .single()

  if (error) {
    throw formatError('Failed to update project config', error.message)
  }

  return data as ProjectConfig
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
