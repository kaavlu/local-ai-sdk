import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyApiKey } from '@/lib/server/api-keys'

const KEY_PREFIX_LENGTH = 20

type ProjectApiKeyRow = {
  id: string
  project_id: string
  key_hash: string
  revoked_at: string | null
}

function unauthorized(code: string) {
  return NextResponse.json({ error: 'unauthorized', code }, { status: 401 })
}

function badRequest(message: string) {
  return NextResponse.json({ error: 'invalid_request', message }, { status: 400 })
}

function readResolverSecret(): string {
  const secret = process.env.DYNO_DEMO_CONFIG_RESOLVER_SECRET?.trim()
  if (!secret) {
    throw new Error('Missing DYNO_DEMO_CONFIG_RESOLVER_SECRET on dashboard-web server')
  }
  return secret
}

export async function POST(request: Request) {
  try {
    const expectedSecret = readResolverSecret()
    const providedSecret = request.headers.get('x-dyno-demo-secret')?.trim() ?? ''
    if (!providedSecret || providedSecret !== expectedSecret) {
      return unauthorized('invalid_resolver_secret')
    }

    const payload = (await request.json()) as { apiKey?: unknown }
    const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
    if (!apiKey) {
      return badRequest('apiKey is required')
    }

    const prefix = apiKey.slice(0, KEY_PREFIX_LENGTH)
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('project_api_keys')
      .select('id, project_id, key_hash, revoked_at')
      .eq('key_prefix', prefix)

    if (error) {
      throw new Error(`Failed to fetch project API keys: ${error.message}`)
    }

    const keys = (data as ProjectApiKeyRow[] | null) ?? []
    const matched = keys.find((key) => verifyApiKey(apiKey, key.key_hash))
    if (!matched) {
      return unauthorized('invalid_api_key')
    }
    if (matched.revoked_at) {
      return unauthorized('revoked_api_key')
    }

    const { error: updateError } = await supabase
      .from('project_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', matched.id)
      .is('revoked_at', null)

    if (updateError) {
      throw new Error(`Failed to update API key usage: ${updateError.message}`)
    }

    return NextResponse.json(
      { projectId: matched.project_id, keyId: matched.id },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    return NextResponse.json({ error: 'internal_error', message }, { status: 500 })
  }
}
