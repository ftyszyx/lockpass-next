import { messages, type Locale } from './i18n'
import { manifestUrlFor } from './site'

/**
 * 客户端下载分组（按"MacOS / Windows"等大类）。
 * 注意：这里定义"可展示的平台大类"，可以多于实际有下载项的平台 ——
 * 没有下载条目的分组在渲染时会被自动跳过（见 DownloadSection.astro）。
 *
 * 增删平台时：
 *   1. 在这里加分组 id；
 *   2. 在 `platformConfigs` 加新条目（分组定义无条目则不会渲染）；
 *   3. 在 `i18n.downloadSection.groups` 加分组名、`platforms` 加 variant 标签。
 */
export const downloadGroups = ['macos', 'windows'] as const
export type DownloadGroup = (typeof downloadGroups)[number]

/**
 * 单个具体的下载条目（每个平台下的每个 variant）。
 * 命名规范：`<os>-<arch>`，例如 `windows-x86_64`。
 *
 * 字段说明：
 * - id：与远端 manifest 路径对齐，调用 `manifestUrlFor(id)` 拉取 latest.json
 * - group：所属分组（决定落在哪个分组下渲染）
 * - labelKey：用于 i18n 中查找显示名称的键
 * - extension：文件扩展名（仅展示用）
 * - fallbackVersion / fallbackDownloadUrl：latest.json 拉取/解析失败时的回退值
 */
const platformConfigs = [
  {
    id: 'windows-x86_64',
    group: 'windows',
    labelKey: 'windowsX64',
    extension: '.exe',
    fallbackVersion: '0.1.18',
    fallbackDownloadUrl:
      'https://oss.bytefuse.cn/apps/com.lockpass.next/web/windows-x86_64/LockPass_0.1.18_x64-setup.exe',
    fallbackSupportQq: ''
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
  /** latest.json 拉取失败时的回退客服 QQ（空字符串表示不展示） */
  fallbackSupportQq: string
}

export interface ResolvedDownload extends DownloadPlatform {
  version: string
  href: string
  fileName: string
  /** 客服 QQ，来自 latest.json 的 `qq` 字段；空字符串表示未配置 */
  supportQq: string
}

interface UpdateManifest {
  version?: unknown
  platform?: unknown
  url?: unknown
  /** 客服 QQ 号码（可选），例如 "10001" */
  qq?: unknown
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
  const preferred =
    downloads.find((download) => download.id === 'windows-x86_64') ?? downloads[0]
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
  const supportQq = pickString(manifest.qq) ?? platform.fallbackSupportQq
  return resolveDownload(platform, version, href, supportQq)
}

function fallbackDownload(platform: DownloadPlatform): ResolvedDownload {
  return resolveDownload(
    platform,
    platform.fallbackVersion,
    platform.fallbackDownloadUrl,
    platform.fallbackSupportQq
  )
}

function resolveDownload(
  platform: DownloadPlatform,
  version: string,
  href: string,
  supportQq: string
): ResolvedDownload {
  return {
    ...platform,
    version,
    href,
    fileName: fileNameFromUrl(href),
    supportQq
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