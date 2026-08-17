import type { VaultItem, VaultItemField } from '@lockpass/core'

const LEGACY_IMPORT_ITEM_PREFIX = 'legacy-lockpass:item:'

export function fieldsWithoutRedundantLegacyNote(item: VaultItem): VaultItemField[] {
  if (!item.importSourceId?.startsWith(LEGACY_IMPORT_ITEM_PREFIX)) return item.fields

  const primaryNote = normalizeNote(item.notes)
  if (!primaryNote) return item.fields

  return item.fields.filter((field) =>
    field.kind !== 'note' || normalizeNote(field.value) !== primaryNote
  )
}

function normalizeNote(value: string): string {
  return value.replace(/\r\n/g, '\n').trim()
}
