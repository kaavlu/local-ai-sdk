import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyApiKey } from '@/lib/server/api-keys'

const KEY_PREFIX_LENGTH = 20
const BEARER_SCHEME = 'bearer '

type ProjectApiKeyRow = {
  id: string
  project_id: string
  key_hash: string
  revoked_at: string | null
}

type ProjectRow = {
  id: string
  use_case_type: string
  strategy_preset: 'local_first' | 'balanced' | 'cloud_first' | string
}

type ProjectConfigRow = {
  project_id: string
  local_model: string | null
  cloud_model: string | null
  fallback_enabled: boolean
  requires_charging: boolean
  wifi_only: boolean
  battery_min_percent: number | null
  idle_min_seconds: number | null
}

function unauthorized(code: 'invalid_api_key' | 'revoked_api_key') {
  return NextResponse.json({ error: 'unauthorized', code }, { status: 401 })
}

function extractBearerToken(request: Request): string {
  const authorization = request.headers.get('authorization')?.trim() ?? ''
  if (!authorization.toLowerCase().startsWith(BEARER_SCHEME)) {
    return ''
  }
  return authorization.slice(BEARER_SCHEME.length).trim()
}

export async function handleSdkConfigRequest(request: Request) {
  return handleSdkConfigRequestWithClient(request, createAdminClient())
}

type SupabaseLikeClient = ReturnType<typeof createAdminClient>

export async function handleSdkConfigRequestWithClient(
  request: Request,
  supabase: SupabaseLikeClient,
) {
  try {
    const apiKey = extractBearerToken(request)
    if (!apiKey) {
      return unauthorized('invalid_api_key')
    }

    const prefix = apiKey.slice(0, KEY_PREFIX_LENGTH)
    const { data: keyRows, error: keyLookupError } = await supabase
      .from('project_api_keys')
      .select('id, project_id, key_hash, revoked_at')
      .eq('key_prefix', prefix)

    if (keyLookupError) {
      throw new Error(`Failed to fetch project API keys: ${keyLookupError.message}`)
    }

    const matchingKey = ((keyRows as ProjectApiKeyRow[] | null) ?? []).find((row) =>
      verifyApiKey(apiKey, row.key_hash),
    )
    if (!matchingKey) {
      return unauthorized('invalid_api_key')
    }
    if (matchingKey.revoked_at) {
      return unauthorized('revoked_api_key')
    }

    const [projectResult, configResult, usageUpdate] = await Promise.all([
      supabase
        .from('projects')
        .select('id, use_case_type, strategy_preset')
        .eq('id', matchingKey.project_id)
        .maybeSingle<ProjectRow>(),
      supabase
        .from('project_configs')
        .select(
          'project_id, local_model, cloud_model, fallback_enabled, requires_charging, wifi_only, battery_min_percent, idle_min_seconds',
        )
        .eq('project_id', matchingKey.project_id)
        .maybeSingle<ProjectConfigRow>(),
      supabase
        .from('project_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', matchingKey.id)
        .is('revoked_at', null),
    ])

    if (projectResult.error) {
      throw new Error(`Failed to fetch project: ${projectResult.error.message}`)
    }
    if (configResult.error) {
      throw new Error(`Failed to fetch project config: ${configResult.error.message}`)
    }
    if (usageUpdate.error) {
      throw new Error(`Failed to update API key usage: ${usageUpdate.error.message}`)
    }
    if (!projectResult.data || !configResult.data) {
      return NextResponse.json({ error: 'not_found', code: 'project_config_not_found' }, { status: 404 })
    }

    return NextResponse.json(
      {
        projectId: projectResult.data.id,
        use_case_type: projectResult.data.use_case_type,
        strategy_preset: projectResult.data.strategy_preset,
        fallback_enabled: configResult.data.fallback_enabled,
        local_model: configResult.data.local_model,
        cloud_model: configResult.data.cloud_model,
        requires_charging: configResult.data.requires_charging,
        wifi_only: configResult.data.wifi_only,
        battery_min_percent: configResult.data.battery_min_percent,
        idle_min_seconds: configResult.data.idle_min_seconds,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 })
  }
}
