import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ENCRYPTION_ALGORITHM = 'aes-256-gcm'
const PAYLOAD_VERSION = 'v1'
const IV_BYTE_LENGTH = 12

function readEncryptionKeyMaterial(): string {
  const raw = process.env.DYNO_SECRETS_ENCRYPTION_KEY?.trim()
  if (!raw) {
    throw new Error('Missing DYNO_SECRETS_ENCRYPTION_KEY for secret encryption')
  }
  return raw
}

function parseEncryptionKey(keyMaterial: string): Buffer {
  if (keyMaterial.startsWith('base64:')) {
    const decoded = Buffer.from(keyMaterial.slice('base64:'.length), 'base64')
    if (decoded.length !== 32) {
      throw new Error('Invalid DYNO_SECRETS_ENCRYPTION_KEY: base64 key must decode to 32 bytes')
    }
    return decoded
  }

  const utf8Key = Buffer.from(keyMaterial, 'utf8')
  if (utf8Key.length === 32) {
    return utf8Key
  }

  const decoded = Buffer.from(keyMaterial, 'base64')
  if (decoded.length === 32) {
    return decoded
  }

  throw new Error(
    'Invalid DYNO_SECRETS_ENCRYPTION_KEY: use 32-byte UTF-8 text or 32-byte base64 (optionally prefixed with "base64:")',
  )
}

function getEncryptionKey(): Buffer {
  return parseEncryptionKey(readEncryptionKeyMaterial())
}

export function encryptSecret(plaintext: string): string {
  const normalized = plaintext.trim()
  if (!normalized) {
    throw new Error('Cannot encrypt an empty secret')
  }

  const key = getEncryptionKey()
  const iv = randomBytes(IV_BYTE_LENGTH)
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return `${PAYLOAD_VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString(
    'base64',
  )}`
}

export function decryptSecret(payload: string): string {
  const segments = payload.split(':')
  if (segments.length !== 4) {
    throw new Error('Invalid secret payload format')
  }

  const [version, ivPart, tagPart, dataPart] = segments
  if (version !== PAYLOAD_VERSION) {
    throw new Error(`Unsupported secret payload version "${version}"`)
  }

  const key = getEncryptionKey()
  const iv = Buffer.from(ivPart, 'base64')
  const authTag = Buffer.from(tagPart, 'base64')
  const ciphertext = Buffer.from(dataPart, 'base64')

  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

  const plaintext = decrypted.toString('utf8').trim()
  if (!plaintext) {
    throw new Error('Decrypted secret is empty')
  }

  return plaintext
}
