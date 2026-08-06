import type { VaultItem } from '@lockpass/core'

export function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin.toLowerCase()
  } catch {
    return null
  }
}

export function itemMatchesOrigin(item: VaultItem, origin: string): boolean {
  const normalizedOrigin = normalizeOrigin(origin)
  if (!normalizedOrigin || item.type !== 'login' || item.archived || item.sync.deletedAt) return false
  return item.urls.some((url) => normalizeOrigin(url) === normalizedOrigin)
}

export function itemsMatchingOrigin(items: VaultItem[], origin: string): VaultItem[] {
  return items.filter((item) => itemMatchesOrigin(item, origin))
}
