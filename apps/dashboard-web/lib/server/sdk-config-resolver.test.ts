import assert from 'node:assert/strict'
import test from 'node:test'
import { hashApiKey } from './api-keys'
import { handleSdkConfigRequestWithClient } from './sdk-config-resolver'
import { encryptSecret } from './secrets'

type FakeRow = Record<string, unknown>

function createFakeSupabaseClient(config: {
  keys?: FakeRow[]
  project?: FakeRow | null
  projectConfig?: FakeRow | null
  keyLookupError?: string
}) {
  return {
    from(table: string) {
      if (table === 'project_api_keys') {
        return {
          select() {
            return {
              eq() {
                if (config.keyLookupError) {
                  return Promise.resolve({ data: null, error: { message: config.keyLookupError } })
                }
                return Promise.resolve({ data: config.keys ?? [], error: null })
              },
            }
          },
          update() {
            return {
              eq() {
                return {
                  is() {
                    return Promise.resolve({ error: null })
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'projects') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: config.project ?? null, error: null })
                  },
                }
              },
            }
          },
        }
      }

      if (table === 'project_configs') {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle() {
                    return Promise.resolve({ data: config.projectConfig ?? null, error: null })
                  },
                }
              },
            }
          },
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

test('returns sdk config for a valid project API key', async () => {
  process.env.DYNO_SECRETS_ENCRYPTION_KEY = '12345678901234567890123456789012'
  delete process.env.DYNO_ENABLE_HOSTED_UPSTREAM_KEY_RELAY
  const apiKey = 'dyno_live_test_123456789'
  const upstreamApiKeyPlaintext = 'sk-test-upstream'
  const request = new Request('http://localhost/api/v1/sdk/config', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const response = await handleSdkConfigRequestWithClient(
    request,
    createFakeSupabaseClient({
      keys: [
        {
          id: 'key_1',
          project_id: 'proj_12345678',
          key_hash: hashApiKey(apiKey),
          revoked_at: null,
        },
      ],
      project: {
        id: 'proj_12345678',
        use_case_type: 'embeddings',
        strategy_preset: 'local_first',
      },
      projectConfig: {
        project_id: 'proj_12345678',
        local_model: null,
        cloud_model: 'text-embedding-3-small',
        logical_model: 'dyno-embeddings-1',
        fallback_enabled: true,
        upstream_provider_type: 'openai_compatible',
        upstream_base_url: 'https://api.openai.com/v1',
        upstream_model: 'text-embedding-3-small',
        upstream_api_key_encrypted: encryptSecret(upstreamApiKeyPlaintext),
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      },
    }) as never,
  )

  assert.equal(response.status, 200)
  const body = (await response.json()) as Record<string, unknown>
  assert.equal(body.projectId, 'proj_12345678')
  assert.equal(body.use_case_type, 'embeddings')
  assert.equal(body.strategy_preset, 'local_first')
  assert.equal(body.logical_model, 'dyno-embeddings-1')
  assert.equal(body.upstream_provider_type, 'openai_compatible')
  assert.equal(body.upstream_base_url, 'https://api.openai.com/v1')
  assert.equal(body.upstream_model, 'text-embedding-3-small')
  assert.equal('upstream_api_key' in body, false)
})

test('returns upstream_api_key only when hosted relay mode is explicitly enabled', async () => {
  process.env.DYNO_SECRETS_ENCRYPTION_KEY = '12345678901234567890123456789012'
  process.env.DYNO_ENABLE_HOSTED_UPSTREAM_KEY_RELAY = 'true'
  const apiKey = 'dyno_live_test_with_relay'
  const upstreamApiKeyPlaintext = 'sk-test-relay'
  const request = new Request('http://localhost/api/v1/sdk/config', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const response = await handleSdkConfigRequestWithClient(
    request,
    createFakeSupabaseClient({
      keys: [
        {
          id: 'key_3',
          project_id: 'proj_12345678',
          key_hash: hashApiKey(apiKey),
          revoked_at: null,
        },
      ],
      project: {
        id: 'proj_12345678',
        use_case_type: 'embeddings',
        strategy_preset: 'local_first',
      },
      projectConfig: {
        project_id: 'proj_12345678',
        local_model: null,
        cloud_model: 'text-embedding-3-small',
        logical_model: 'dyno-embeddings-1',
        fallback_enabled: true,
        upstream_provider_type: 'openai_compatible',
        upstream_base_url: 'https://api.openai.com/v1',
        upstream_model: 'text-embedding-3-small',
        upstream_api_key_encrypted: encryptSecret(upstreamApiKeyPlaintext),
        requires_charging: false,
        wifi_only: false,
        battery_min_percent: null,
        idle_min_seconds: null,
      },
    }) as never,
  )

  assert.equal(response.status, 200)
  const body = (await response.json()) as Record<string, unknown>
  assert.equal(body.upstream_api_key, upstreamApiKeyPlaintext)
  delete process.env.DYNO_ENABLE_HOSTED_UPSTREAM_KEY_RELAY
})

test('returns invalid_api_key when Authorization is missing', async () => {
  const request = new Request('http://localhost/api/v1/sdk/config', { method: 'GET' })
  const response = await handleSdkConfigRequestWithClient(
    request,
    createFakeSupabaseClient({}) as never,
  )
  assert.equal(response.status, 401)
  const body = (await response.json()) as Record<string, unknown>
  assert.equal(body.code, 'invalid_api_key')
})

test('returns revoked_api_key when key is revoked', async () => {
  const apiKey = 'dyno_live_test_revoked'
  const request = new Request('http://localhost/api/v1/sdk/config', {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const response = await handleSdkConfigRequestWithClient(
    request,
    createFakeSupabaseClient({
      keys: [
        {
          id: 'key_2',
          project_id: 'proj_12345678',
          key_hash: hashApiKey(apiKey),
          revoked_at: new Date().toISOString(),
        },
      ],
    }) as never,
  )
  assert.equal(response.status, 401)
  const body = (await response.json()) as Record<string, unknown>
  assert.equal(body.code, 'revoked_api_key')
})
