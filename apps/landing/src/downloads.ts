import { messages, type Locale } from './i18n'
import { manifestUrlFor } from './site'

export const downloadGroups = ['windows'] as const
export type DownloadGroup = (typeof downloadGroups)[number]

const platformConfigs = [
  {
    id: 'windows-x86_64',
    group: 'windows',
    labelKey: 'windowsX64',
    extension: '.exe',
    fallbackVersion: '0.1.1',
    fallbackDownloadUrl:
      'https://oss.bytefuse.cn/apps/com.lockpass.next/web/windows-x86_64/LockPass_0.1.1_x64-setup.exe'
  }
] as const

export type DownloadPlatformId = (typeof platformConfigs)[number]['id']

export interface DownloadPlatform {
  id: DownloadPlatformId
  group: DownloadGroup
  label: string
  extension: string
  manifestUrl: string
  fallbackVersion: string
  fallbackDownloadUrl: string
}

export interface ResolvedDownload extends DownloadPlatform {
  version: string
  href: string
  fileName: string
}

interface UpdateManifest {
  version?: unknown
  platform?: unknown
  url?: unknown
}

export function getLocalizedDownloadPlatforms(locale: Locale): DownloadPlatform[] {
  const labels = messages[locale].downloadSection.platforms
  return platformConfigs.map((platform) => ({
    ...platform,
    label: labels[platform.labelKey],
    manifestUrl: manifestUrlFor(platform.id)
  }))
}

export async function loadDownloadPlatforms(locale: Locale): Promise<ResolvedDownload[]> {
  return Promise.all(getLocalizedDownloadPlatforms(locale).map(loadDownloadPlatform))
}

export function preferredDownload(downloads: ResolvedDownload[]): ResolvedDownload {
  const preferred = downloads.find((download) => download.id === 'windows-x86_64') ?? downloads[0]
  if (!preferred) throw new Error('At least one download platform must be configured')
  return preferred
}

async function loadDownloadPlatform(platform: DownloadPlatform): Promise<ResolvedDownload> {
  try {
    const response = await fetch(platform.manifestUrl, { cache: 'no-store' })
    if (!response.ok) return fallbackDownload(platform)
    return parseDownloadManifest(platform, await response.json())
  } catch {
    return fallbackDownload(platform)
  }
}

function parseDownloadManifest(platform: DownloadPlatform, manifest: UpdateManifest): ResolvedDownload {
  if (typeof manifest.platform === 'string' && manifest.platform !== platform.id) {
    return fallbackDownload(platform)
  }
  const version = pickString(manifest.version) ?? platform.fallbackVersion
  const href = pickString(manifest.url) ?? platform.fallbackDownloadUrl
  return resolveDownload(platform, version, href)
}

function fallbackDownload(platform: DownloadPlatform): ResolvedDownload {
  return resolveDownload(platform, platform.fallbackVersion, platform.fallbackDownloadUrl)
}

function resolveDownload(platform: DownloadPlatform, version: string, href: string): ResolvedDownload {
  return {
    ...platform,
    version,
    href,
    fileName: fileNameFromUrl(href)
  }
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function fileNameFromUrl(value: string): string {
  try {
    const fileName = new URL(value).pathname.split('/').filter(Boolean).at(-1)
    return fileName ? decodeURIComponent(fileName) : value
  } catch {
    return value
  }
}
