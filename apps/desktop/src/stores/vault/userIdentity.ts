import type { DesktopUserCrypto } from '@/services/masterPassword'
import { normalizeSyncServerUrl } from '@/services/syncClient'
import type { DesktopUserProfile } from '@/services/vaultRepository'

const SERVER_USER_ID_PREFIX = 'server-user-'
const SERVER_ACCOUNT_IDENTITY_PURPOSE = 'lockpass local server account v1'

export function canonicalServerUrl(serverUrl: string): string {
  const normalized = normalizeSyncServerUrl(serverUrl)
  if (!normalized) return ''

  const url = new URL(normalized)
  url.hash = ''
  url.search = ''
  url.pathname = url.pathname.replace(/\/+$/, '') || '/'
  return url.toString().replace(/\/$/, '')
}

export function serverAccountIdentityKey(serverUrl: string, accountId: string): string {
  return `${canonicalServerUrl(serverUrl)}\0${accountId.trim()}`
}

export function serverAccountIdentityForUser(user: DesktopUserProfile): string | null {
  const accountId = user.sync?.accountId?.trim()
  const serverUrl = user.sync?.serverUrl?.trim()
  if (!accountId || !serverUrl) return null
  return serverAccountIdentityKey(serverUrl, accountId)
}

export async function serverAccountLocalUserId(serverUrl: string, accountId: string): Promise<string> {
  const identity = serverAccountIdentityKey(serverUrl, accountId)
  if (!canonicalServerUrl(serverUrl) || !accountId.trim()) {
    throw new Error('server-account-identity-required')
  }

  const input = new TextEncoder().encode(`${SERVER_ACCOUNT_IDENTITY_PURPOSE}\0${identity}`)
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input))
    return `${SERVER_USER_ID_PREFIX}${bytesToHex(digest)}`
  } finally {
    input.fill(0)
  }
}

export function cryptoUserIdForUser(user: DesktopUserProfile): string {
  return cryptoUserIdForConfig(user.crypto, user.sync?.accountId ?? user.id)
}

export function cryptoUserIdForConfig(
  cryptoConfig: DesktopUserCrypto | null | undefined,
  fallbackUserId: string,
): string {
  const wrappedUserId = cryptoConfig?.wrappedVaultKey.aad.userId?.trim()
  return wrappedUserId || fallbackUserId
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}
