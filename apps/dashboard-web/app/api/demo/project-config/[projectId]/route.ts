import { createAdminClient } from '@/lib/supabase/admin'
import { decryptSecret } from '@/lib/server/secrets'
import { NextResponse } from 'next/server'

type ProjectRow = {
  id: string
  use_case_type: string
  strategy_preset: 'local_first' | 'balanced' | 'cloud_first' | string
}

type ProjectConfigRow = {
  project_id: string
  local_model: string | null
  cloud_model: string | null
  logical_model: string
  upstream_provider_type: 'openai_compatible' | string
  upstream_base_url: string | null
  upstream_model: string | null
  fallback_enabled: boolean
  upstream_api_key_encrypted: string | null
  upstream_api_key_last_updated_at: string | null
  requires_charging: boolean
  wifi_only: boolean
  battery_min_percent: number | null
  idle_min_seconds: number | null
  estimated_cloud_cost_per_request_usd: number | null
}

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function badRequest(message: string) {
  return NextResponse.json({ error: 'invalid_request', message }, { status: 400 })
}

function notFound(message: string) {
  return NextResponse.json({ error: 'not_found', message }, { status: 404 })
}

function readResolverSecret(): string {
  const secret = process.env.DYNO_DEMO_CONFIG_RESOLVER_SECRET?.trim()
  if (!secret) {
    throw new Error('Missing DYNO_DEMO_CONFIG_RESOLVER_SECRET on dashboard-web server')
  }
  return secret
}

function isValidProjectId(projectId: string): boolean {
  return /^[a-zA-Z0-9-]{8,}$/.test(projectId)
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const expectedSecret = readResolverSecret()
    const providedSecret = request.headers.get('x-dyno-demo-secret')?.trim() ?? ''
    if (!providedSecret || providedSecret !== expectedSecret) {
      return unauthorized()
    }

    const { projectId: rawProjectId } = await params
    const projectId = rawProjectId?.trim() ?? ''

    if (!projectId) {
      return badRequest('projectId route parameter is required')
    }
    if (!isValidProjectId(projectId)) {
      return badRequest('projectId must be a non-empty ID-like string')
    }

    const supabase = createAdminClient()
    const [projectResult, configResult] = await Promise.all([
      supabase
        .from('projects')
        .select('id, use_case_type, strategy_preset')
        .eq('id', projectId)
        .maybeSingle<ProjectRow>(),
      supabase
        .from('project_configs')
        .select(
          'project_id, local_model, cloud_model, logical_model, upstream_provider_type, upstream_base_url, upstream_model, fallback_enabled, upstream_api_key_encrypted, upstream_api_key_last_updated_at, requires_charging, wifi_only, battery_min_percent, idle_min_seconds, estimated_cloud_cost_per_request_usd',
        )
        .eq('project_id', projectId)
        .maybeSingle<ProjectConfigRow>(),
    ])

    if (projectResult.error) {
      throw new Error(`Failed to fetch project: ${projectResult.error.message}`)
    }
    if (configResult.error) {
      throw new Error(`Failed to fetch project config: ${configResult.error.message}`)
    }
    if (!projectResult.data) {
      return notFound(`Project not found for projectId "${projectId}"`)
    }
    if (!configResult.data) {
      return notFound(`Project config not found for projectId "${projectId}"`)
    }

    const upstreamApiKey = configResult.data.upstream_api_key_encrypted
      ? decryptSecret(configResult.data.upstream_api_key_encrypted)
      : null

    return NextResponse.json(
      {
        projectId: projectResult.data.id,
        use_case_type: projectResult.data.use_case_type,
        strategy_preset: projectResult.data.strategy_preset,
        logical_model: configResult.data.logical_model,
        fallback_enabled: configResult.data.fallback_enabled,
        upstream_provider_type: configResult.data.upstream_provider_type,
        local_model: configResult.data.local_model,
        cloud_model: configResult.data.cloud_model,
        upstream_base_url: configResult.data.upstream_base_url,
        upstream_model: configResult.data.upstream_model ?? configResult.data.cloud_model,
        upstream_api_key_last_updated_at: configResult.data.upstream_api_key_last_updated_at,
        upstreamBaseUrl: configResult.data.upstream_base_url,
        upstreamModel: configResult.data.upstream_model ?? configResult.data.cloud_model,
        upstreamApiKey: upstreamApiKey ?? undefined,
        requires_charging: configResult.data.requires_charging,
        wifi_only: configResult.data.wifi_only,
        battery_min_percent: configResult.data.battery_min_percent,
        idle_min_seconds: configResult.data.idle_min_seconds,
        estimated_cloud_cost_per_request_usd: configResult.data.estimated_cloud_cost_per_request_usd,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 })
  }
}
