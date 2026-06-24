export const DEFAULT_OFFICIAL_SERVER_URL = 'http://127.0.0.1:1431'
export const DEFAULT_OFFICIAL_API_URL = 'http://127.0.0.1:1480'

export function configuredOfficialServerUrl(): string {
  return normalizeServerUrl(import.meta.env.VITE_LOCKPASS_OFFICIAL_SERVER_URL || DEFAULT_OFFICIAL_SERVER_URL, DEFAULT_OFFICIAL_SERVER_URL)
}

export function configuredOfficialApiUrl(): string {
  return normalizeServerUrl(import.meta.env.VITE_LOCKPASS_OFFICIAL_API_URL || DEFAULT_OFFICIAL_API_URL, DEFAULT_OFFICIAL_API_URL)
}

export function normalizeServerUrl(value: string, fallback = ''): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed) return fallback
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}
