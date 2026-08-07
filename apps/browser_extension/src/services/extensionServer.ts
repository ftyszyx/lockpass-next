import type {
  ExtensionDeviceAuthorization,
  ExtensionServerMode,
  ExtensionServerSettings
} from '@/shared/models'

export function defaultExtensionServerSettings(): ExtensionServerSettings {
  return { mode: 'official', selfHostUrl: '' }
}

export function createExtensionServerSettings(input: {
  mode: ExtensionServerMode
  selfHostUrl?: string
}): ExtensionServerSettings {
  if (input.mode === 'official') {
    return {
      mode: 'official',
      selfHostUrl: normalizeOptionalSelfHostUrl(input.selfHostUrl)
    }
  }
  return {
    mode: 'selfhost',
    selfHostUrl: normalizeSelfHostServerUrl(input.selfHostUrl ?? '')
  }
}

export function normalizeStoredExtensionServerSettings(
  input: Partial<ExtensionServerSettings> | null | undefined
): ExtensionServerSettings {
  const selfHostUrl = normalizeOptionalSelfHostUrl(input?.selfHostUrl)
  return {
    mode: input?.mode === 'selfhost' && selfHostUrl ? 'selfhost' : 'official',
    selfHostUrl
  }
}

export function normalizeSelfHostServerUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('server-url-required')

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error('server-url-invalid')
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.pathname && url.pathname !== '/') ||
    url.search ||
    url.hash
  ) {
    throw new Error('server-url-invalid')
  }
  return url.origin
}

export function assertExtensionAuthorizationTarget(
  authorization: ExtensionDeviceAuthorization,
  expected: { mode: ExtensionServerMode; apiUrl: string }
): void {
  if (authorization.mode !== expected.mode) throw new Error('authorization-server-mismatch')
  if (normalizeComparableUrl(authorization.serverUrl) !== normalizeComparableUrl(expected.apiUrl)) {
    throw new Error('authorization-server-mismatch')
  }
}

function normalizeOptionalSelfHostUrl(value: string | undefined): string {
  if (!value?.trim()) return ''
  try {
    return normalizeSelfHostServerUrl(value)
  } catch {
    return ''
  }
}

function normalizeComparableUrl(value: string): string {
  try {
    return new URL(value).toString().replace(/\/+$/, '')
  } catch {
    throw new Error('authorization-server-mismatch')
  }
}
