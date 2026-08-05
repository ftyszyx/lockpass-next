import {
  base64urlToBytes,
  bytesToBase64url,
  concatBytes,
  randomBytes,
  stableStringify,
  toArrayBuffer,
  utf8ToBytes
} from './encoding.js'
import type { CryptoEnvelope } from './types.js'

const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16

export async function importAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  if (bytes.byteLength !== KEY_BYTES) throw new Error('AES-256-GCM key must be 32 bytes')
  return crypto.subtle.importKey('raw', toArrayBuffer(bytes), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptEnvelope<AdditionalInfo extends Record<string, unknown>>(
  key: CryptoKey | Uint8Array,
  plaintext: Uint8Array,
  additionalInfo: AdditionalInfo,
  keyId: string
): Promise<CryptoEnvelope<AdditionalInfo>> {
  const nonce = randomBytes(NONCE_BYTES)
  const cryptoKey = key instanceof Uint8Array ? await importAesKey(key) : key
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(utf8ToBytes(stableStringify(additionalInfo))),
        tagLength: 128
      },
      cryptoKey,
      toArrayBuffer(plaintext)
    )
  )

  return {
    version: 1,
    alg: 'AES-256-GCM',
    keyId,
    nonce: bytesToBase64url(nonce),
    aad: additionalInfo,
    ciphertext: bytesToBase64url(encrypted.slice(0, encrypted.byteLength - TAG_BYTES)),
    tag: bytesToBase64url(encrypted.slice(encrypted.byteLength - TAG_BYTES))
  }
}

export async function decryptEnvelope<AdditionalInfo extends Record<string, unknown>>(
  key: CryptoKey | Uint8Array,
  envelope: CryptoEnvelope<AdditionalInfo>,
  expectedAdditionalInfo: AdditionalInfo,
  expectedKeyId: string
): Promise<Uint8Array> {
  if (envelope.version !== 1 || envelope.alg !== 'AES-256-GCM') {
    throw new Error('Unsupported encrypted envelope')
  }
  if (envelope.keyId !== expectedKeyId) throw new Error('Encrypted envelope key does not match')
  if (stableStringify(envelope.aad) !== stableStringify(expectedAdditionalInfo)) {
    throw new Error('Encrypted envelope metadata does not match')
  }

  const cryptoKey = key instanceof Uint8Array ? await importAesKey(key) : key
  const encrypted = concatBytes(base64urlToBytes(envelope.ciphertext), base64urlToBytes(envelope.tag))
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: toArrayBuffer(base64urlToBytes(envelope.nonce)),
      additionalData: toArrayBuffer(utf8ToBytes(stableStringify(envelope.aad))),
      tagLength: 128
    },
    cryptoKey,
    toArrayBuffer(encrypted)
  )
  return new Uint8Array(plaintext)
}
