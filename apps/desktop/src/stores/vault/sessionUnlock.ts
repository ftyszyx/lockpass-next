export interface SessionUnlockCache {
  userId: string
  keyId: string
  vaultKey: Uint8Array
  verifierSalt: string
  verifierHash: string
  createdAt: string
  lastUsedAt: string
}

export async function verifySessionUnlockCache(cache: SessionUnlockCache, password: string): Promise<boolean> {
  const verifierHash = await sessionPasswordVerifier(password, cache.verifierSalt, cache.userId, cache.keyId)
  return timingSafeEqualText(verifierHash, cache.verifierHash)
}

export async function sessionPasswordVerifier(password: string, salt: string, userId: string, keyId: string): Promise<string> {
  const input = new TextEncoder().encode(`lockpass session unlock v1\0${userId}\0${keyId}\0${salt}\0${password.normalize('NFKC')}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return bytesToHex(new Uint8Array(digest))
}

export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualText(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

export function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}
