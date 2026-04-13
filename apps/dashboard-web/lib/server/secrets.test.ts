import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { decryptSecret, encryptSecret } from './secrets'

const originalKey = process.env.DYNO_SECRETS_ENCRYPTION_KEY

afterEach(() => {
  process.env.DYNO_SECRETS_ENCRYPTION_KEY = originalKey
})

test('encryptSecret and decryptSecret round-trip with utf8 key', () => {
  process.env.DYNO_SECRETS_ENCRYPTION_KEY = '12345678901234567890123456789012'
  const plaintext = 'sk-live-123'
  const encrypted = encryptSecret(plaintext)
  assert.ok(encrypted.startsWith('v1:'))
  assert.equal(encrypted.includes(plaintext), false)
  assert.equal(decryptSecret(encrypted), plaintext)
})

test('encryptSecret supports base64-prefixed keys', () => {
  process.env.DYNO_SECRETS_ENCRYPTION_KEY = `base64:${Buffer.from('12345678901234567890123456789012').toString('base64')}`
  const encrypted = encryptSecret('sk-live-456')
  assert.equal(decryptSecret(encrypted), 'sk-live-456')
})

test('encryptSecret fails clearly when key is missing', () => {
  delete process.env.DYNO_SECRETS_ENCRYPTION_KEY
  assert.throws(() => encryptSecret('sk-live-789'), /DYNO_SECRETS_ENCRYPTION_KEY/)
})
