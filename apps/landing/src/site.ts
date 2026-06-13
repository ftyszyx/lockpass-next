export const updateFeedHref = 'https://bytefuse.oss-cn-guangzhou.aliyuncs.com/lockpass/latest.json'

export interface DesktopDownload {
  platform: string
  version: string
  fileName: string
  href: string
}

interface UpdateManifest {
  version?: unknown
  platforms?: Record<string, { url?: unknown }>
}

export const fallbackDownload: DesktopDownload = {
  platform: 'Windows x64',
  version: '0.1.1',
  fileName: 'LockPass_0.1.1_x64-setup.exe',
  href: 'https://bytefuse.oss-cn-guangzhou.aliyuncs.com/lockpass/windows/LockPass_0.1.1_x64-setup.exe'
}

export async function loadWindowsDownload(): Promise<DesktopDownload> {
  try {
    const response = await fetch(updateFeedHref)
    if (!response.ok) return fallbackDownload
    return parseWindowsDownload(await response.json())
  } catch {
    return fallbackDownload
  }
}

export function parseWindowsDownload(manifest: UpdateManifest): DesktopDownload {
  const version = typeof manifest.version === 'string' && manifest.version.trim() ? manifest.version.trim() : fallbackDownload.version
  const href = manifest.platforms?.['windows-x86_64']?.url
  if (typeof href !== 'string' || !href.trim()) return { ...fallbackDownload, version }

  return {
    platform: fallbackDownload.platform,
    version,
    fileName: fileNameFromUrl(href),
    href
  }
}

function fileNameFromUrl(value: string): string {
  try {
    const pathname = new URL(value).pathname
    const fileName = pathname.split('/').filter(Boolean).at(-1)
    return fileName ? decodeURIComponent(fileName) : fallbackDownload.fileName
  } catch {
    return fallbackDownload.fileName
  }
}
