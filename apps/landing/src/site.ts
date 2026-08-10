export const downloadManifestTemplate = 'https://oss.bytefuse.cn/apps/com.lockpass.next/web/{platform}/latest.json'

export function manifestUrlFor(platform: string): string {
  return downloadManifestTemplate.replace('{platform}', platform)
}
