import { configuredOfficialApiUrl } from '@/services/appConfig'
import {
  normalizeSyncServerUrl,
  SyncApiError,
  type SyncApiClient,
  type SyncDeviceBindCallbackPayload
} from '@/services/syncClient'
import type { DesktopSyncSettings } from '@/services/vaultRepository'
import { requireSelfHostServerUrl } from './model'

export async function ensureSyncSpace(
  client: SyncApiClient,
  deviceToken: string,
  _displayName: string
): Promise<{ id: string }> {
  const normalizedDisplayName = 'default'
  const spaces = await client.syncSpaces(deviceToken)
  return spaces.syncSpaces.find((space) => space.displayName === normalizedDisplayName)
    ?? (await client.createSyncSpace(deviceToken, normalizedDisplayName)).syncSpace
}

export function syncServerUrlForSettings(sync: DesktopSyncSettings): string {
  return sync.mode === 'official'
    ? configuredOfficialApiUrl()
    : requireSelfHostServerUrl(sync.serverUrl)
}

export function webUrlForApiUrl(apiUrl: string): string {
  const normalized = requireSelfHostServerUrl(apiUrl)
  try {
    const url = new URL(normalized)
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      const port = Number(url.port)
      if (port === 1480) {
        url.port = '1431'
      }
    }
    return url.toString()
  } catch {
    return normalized
  }
}

export function parseSyncDeviceBindCallback(value: string): SyncDeviceBindCallbackPayload {
  const parsed = new URL(value)
  if (parsed.protocol !== 'lockpassnew:' || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
    throw new Error('syncOfficialCallbackMismatch')
  }

  const payloadText = parsed.searchParams.get('payload')
  if (!payloadText) throw new Error('syncOfficialAuthorizationMissing')

  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadText))) as SyncDeviceBindCallbackPayload
    if (
      (decoded.mode !== 'official' && decoded.mode !== 'selfhost') ||
      !decoded.serverUrl ||
      !decoded.deviceToken ||
      !decoded.account?.id ||
      !decoded.device?.id
    ) {
      throw new Error('syncOfficialCallbackMismatch')
    }
    return {
      ...decoded,
      serverUrl: decoded.mode === 'official'
        ? configuredOfficialApiUrl()
        : normalizeSyncServerUrl(decoded.serverUrl)
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'syncOfficialCallbackMismatch') throw error
    throw new Error('syncOfficialCallbackMismatch')
  }
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function deviceDisplayName(): string {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (userAgent.includes('Windows')) return 'LockPass Windows Desktop'
  if (userAgent.includes('Mac')) return 'LockPass macOS Desktop'
  if (userAgent.includes('Linux')) return 'LockPass Linux Desktop'
  return 'LockPass Desktop'
}

export function isSyncConnectionInvalid(error: unknown): boolean {
  if (error instanceof SyncApiError) {
    return error.status === 401 || error.status === 403 || error.status === 404
  }

  const message = error instanceof Error ? error.message : String(error)
  return /unauthorized|forbidden|not found|device not found|sync space/i.test(message)
}

export function syncErrorLogMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof SyncApiError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status
    }
  }

  if (error instanceof Error) {
    const metadata: Record<string, unknown> = {
      name: error.name,
      message: error.message
    }
    const cause = (error as Error & { cause?: unknown }).cause
    if (cause instanceof Error) {
      metadata.causeName = cause.name
      metadata.causeMessage = cause.message
    } else if (cause) {
      metadata.cause = String(cause)
    }
    return metadata
  }

  return { message: String(error) }
}

export function syncErrorMessage(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)
}
