import type { VaultAttachment, VaultItem } from '@lockpass/core'

type SearchableAttachment = Pick<VaultAttachment, 'fileName' | 'itemId'>

export function vaultItemMatchesSearch(item: VaultItem, query: string, attachments: SearchableAttachment[] = []): boolean {
  const keyword = normalizeSearchText(query)
  if (!keyword) return true

  const attachmentText = attachments
    .filter((attachment) => attachment.itemId === item.id)
    .map((attachment) => attachment.fileName)

  return buildSearchText(item, attachmentText).includes(keyword)
}

function buildSearchText(item: VaultItem, attachmentText: string[]): string {
  const publicFields = item.fields
    .filter((field) => !field.sensitive)
    .map((field) => `${field.label} ${field.value}`)

  return normalizeSearchText(
    [
      item.title,
      item.notes,
      ...item.urls,
      ...publicFields,
      ...attachmentText
    ].join(' ')
  )
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase()
}
