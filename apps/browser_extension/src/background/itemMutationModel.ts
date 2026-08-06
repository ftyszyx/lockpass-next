import type { VaultItem, VaultItemField } from '@lockpass/core'
import type { ExtensionItemSaveInput } from '../shared/models'

const EXTENSION_ITEM_SCHEMA_VERSION = 1 as const

export function buildExtensionVaultItem(
  input: ExtensionItemSaveInput,
  existing: VaultItem | null,
  deviceId: string,
  now = new Date().toISOString()
): VaultItem {
  const title = input.title.trim()
  if (!title) throw new Error('item-title-required')

  const normalizedFields = normalizeFields(input.fields)
  const urls = collectFieldValues(normalizedFields, 'url')
  const fields = stripUrlFields(normalizedFields)
  const revision = (existing?.sync.revision ?? 0) + 1

  return {
    id: existing?.id ?? `item-${crypto.randomUUID()}`,
    vaultId: input.vaultId,
    schemaVersion: EXTENSION_ITEM_SCHEMA_VERSION,
    type: input.type,
    title,
    subtitle: buildItemSubtitle(input.type, fields, urls, input.notes, existing?.subtitle ?? ''),
    notes: input.notes.trim(),
    urls,
    tags: existing?.tags ?? [],
    favorite: existing?.favorite ?? false,
    archived: existing?.archived ?? false,
    fields,
    attachmentIds: existing?.attachmentIds ?? [],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sync: {
      revision,
      baseRevision: existing?.sync.revision ?? 0,
      updatedByDeviceId: deviceId,
      deletedAt: null,
      state: 'dirty'
    }
  }
}

export function withCleanItemSync(item: VaultItem, revision: number): VaultItem {
  return {
    ...item,
    sync: {
      ...item.sync,
      revision,
      baseRevision: revision,
      state: 'clean'
    }
  }
}

function normalizeFields(fields: VaultItemField[]): VaultItemField[] {
  return fields.map((field) => {
    const normalized: VaultItemField = {
      id: field.id || `field-${crypto.randomUUID()}`,
      kind: field.kind,
      label: field.label.trim(),
      value: field.value,
      sensitive: field.sensitive
    }
    const children = field.children ? normalizeFields(field.children) : []
    if (children.length) normalized.children = children
    return normalized
  })
}

function collectFieldValues(fields: VaultItemField[], kind: VaultItemField['kind']): string[] {
  const values: string[] = []
  for (const field of fields) {
    if (field.kind === kind && field.value.trim()) values.push(field.value.trim())
    if (field.children?.length) values.push(...collectFieldValues(field.children, kind))
  }
  return [...new Set(values)]
}

function stripUrlFields(fields: VaultItemField[]): VaultItemField[] {
  return fields.flatMap((field) => {
    if (field.kind === 'url') return []
    const children = field.children ? stripUrlFields(field.children) : []
    return [{
      ...field,
      ...(children.length ? { children } : { children: undefined })
    }]
  })
}

function buildItemSubtitle(
  type: VaultItem['type'],
  fields: VaultItemField[],
  urls: string[],
  notes: string,
  existingSubtitle: string
): string {
  if (type === 'secure-note') return notes.trim().slice(0, 80)
  if (type === 'payment-card') return firstFieldValue(fields, ['cardholder'])
  if (type === 'attachment') return existingSubtitle
  const account = firstFieldValue(fields, ['username', 'email', 'phone'])
  const website = urls[0] ?? ''
  return [account, website].filter(Boolean).join(' / ')
    || firstFieldValue(fields, ['recovery-code'])
}

function firstFieldValue(fields: VaultItemField[], kinds: VaultItemField['kind'][]): string {
  for (const field of fields) {
    if (kinds.includes(field.kind) && field.value) return field.value
    const child = field.children ? firstFieldValue(field.children, kinds) : ''
    if (child) return child
  }
  return ''
}
