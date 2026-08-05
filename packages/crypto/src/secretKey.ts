import { base64urlToBytes, randomBytes } from './encoding.js'

const SECRET_KEY_BYTES = 32
const SECRET_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateSecretKey(): string {
  return `LP-${formatSecretKey(bytesToSecretKeyText(randomBytes(SECRET_KEY_BYTES)))}`
}

export function decodeSecretKey(value: string): Uint8Array {
  const normalized = normalizeSecretKeyText(value)
  if (!normalized) throw new Error('Secret Key is required')
  if (/^[A-HJ-NP-Z2-9]+$/i.test(normalized) && normalized.length === 52) {
    return secretKeyTextToBytes(normalized)
  }
  return base64urlToBytes(normalized)
}

function formatSecretKey(value: string): string {
  return value.match(/.{1,4}/g)?.join('-') ?? value
}

function normalizeSecretKeyText(value: string): string {
  const raw = value.trim().replace(/^LP-/i, '').replace(/\s/g, '')
  let normalized = ''
  let groupLength = 0

  for (const character of raw) {
    if (character === '-' && groupLength === 4) {
      groupLength = 0
      continue
    }
    normalized += character
    groupLength += 1
  }
  return normalized
}

function bytesToSecretKeyText(bytes: Uint8Array): string {
  let output = ''
  let buffer = 0
  let bits = 0

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += SECRET_KEY_ALPHABET[(buffer >> bits) & 31]
      buffer &= (1 << bits) - 1
    }
  }
  if (bits > 0) output += SECRET_KEY_ALPHABET[(buffer << (5 - bits)) & 31]
  return output
}

function secretKeyTextToBytes(value: string): Uint8Array {
  const output: number[] = []
  let buffer = 0
  let bits = 0

  for (const character of value.toUpperCase()) {
    const index = SECRET_KEY_ALPHABET.indexOf(character)
    if (index < 0) throw new Error('Invalid Secret Key')
    buffer = (buffer << 5) | index
    bits += 5
    while (bits >= 8) {
      bits -= 8
      output.push((buffer >> bits) & 255)
      buffer &= (1 << bits) - 1
    }
  }

  if (output.length !== SECRET_KEY_BYTES) throw new Error('Invalid Secret Key length')
  return Uint8Array.from(output)
}
