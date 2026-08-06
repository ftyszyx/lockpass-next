import type { VaultItem } from '@lockpass/core'

export function getAccountInitials(value: string): string {
  const clean = value.trim()
  if (!clean) return 'LP'
  if (clean.includes('@')) {
    const emailName = clean.split('@')[0]?.replace(/[^a-z0-9]/gi, '') ?? ''
    if (emailName) return emailName.slice(0, 2).toUpperCase()
  }
  const asciiWords = clean.match(/[a-z0-9]+/gi)
  if (asciiWords?.length) {
    return asciiWords
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase()
  }
  return clean.slice(0, 2).toUpperCase()
}

export function vaultItemIconText(item: VaultItem): string {
  if (item.type === 'payment-card') return 'CARD'
  if (item.type === 'secure-note') return 'NOTE'
  if (item.type === 'attachment') return 'FILE'
  return item.title.slice(0, 2).toUpperCase()
}
