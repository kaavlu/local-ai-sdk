import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const KEY_SCHEME = 'dyno_live'
const TOKEN_BYTES = 24
const PREFIX_LENGTH = 20

export interface GeneratedApiKey {
  plaintextKey: string
  keyPrefix: string
}

export function hashApiKey(plaintextKey: string): string {
  return createHash('sha256').update(plaintextKey, 'utf8').digest('hex')
}

export function verifyApiKey(plaintextKey: string, storedHash: string): boolean {
  const provided = Buffer.from(hashApiKey(plaintextKey), 'utf8')
  const stored = Buffer.from(storedHash, 'utf8')
  if (provided.length !== stored.length) {
    return false
  }
  return timingSafeEqual(provided, stored)
}

export function generateApiKey(): GeneratedApiKey {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  const plaintextKey = `${KEY_SCHEME}_${token}`
  return {
    plaintextKey,
    keyPrefix: plaintextKey.slice(0, PREFIX_LENGTH),
  }
}
