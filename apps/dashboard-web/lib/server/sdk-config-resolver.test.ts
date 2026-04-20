import assert from 'node:assert/strict'
import test from 'node:test'
import { hashApiKey } from './api-keys'
import { handleSdkConfigRequestWithClient } from './sdk-config-resolver'

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
  const apiKey = 'dyno_live_test_123456789'
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
        fallback_enabled: true,
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
