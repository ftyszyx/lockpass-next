import type { Vault, VaultItem, VaultItemField } from '@lockpass/core'
import type { ExternalImportItem, ExternalImportVault } from '@/services/backup'

export interface ImportedItemMatch {
  source: ExternalImportItem
  existing: VaultItem
}

export interface ImportedItemPartition {
  matches: ImportedItemMatch[]
  missing: ExternalImportItem[]
}

export function importableExternalItems(items: ExternalImportItem[]): ExternalImportItem[] {
  return items.filter((item) =>
    item.title.trim() || item.fields.some((field) => field.value.trim()) || item.notes.trim()
  )
}

export function findPreviouslyImportedVault(
  sourceVault: ExternalImportVault,
  vaults: Vault[],
  items: VaultItem[]
): Vault | null {
  const activeVaults = vaults.filter((vault) => !vault.sync.deletedAt)
  if (sourceVault.sourceId) {
    const sourceMatch = activeVaults.find((vault) => vault.importSourceId === sourceVault.sourceId)
    if (sourceMatch) return sourceMatch
  }

  if (!sourceVault.sourceId) return null
  const sourceItems = importableExternalItems(sourceVault.items)
  if (sourceItems.length === 0) return null
  return activeVaults.find((vault) => {
    if (vault.importSourceId || normalizeName(vault.name) !== normalizeName(sourceVault.name)) return false
    const existingItems = activeItemsForVault(items, vault.id)
    return itemFingerprintsContained(sourceItems.map(externalItemFingerprint), existingItems.map(vaultItemFingerprint))
  }) ?? null
}

export function partitionImportedItems(
  sourceItems: ExternalImportItem[],
  existingItems: VaultItem[]
): ImportedItemPartition {
  const available = existingItems.filter((item) => !item.sync.deletedAt)
  const consumedIds = new Set<string>()
  const matches: ImportedItemMatch[] = []
  const missing: ExternalImportItem[] = []

  for (const source of sourceItems) {
    const existing = findItemMatch(source, available, consumedIds)
    if (!existing) {
      missing.push(source)
      continue
    }
    consumedIds.add(existing.id)
    matches.push({ source, existing })
  }

  return { matches, missing }
}

export function attachImportSource<T extends Vault | VaultItem>(
  object: T,
  importSourceId: string | undefined,
  now: string,
  deviceId: string
): T {
  if (!importSourceId || object.importSourceId === importSourceId) return object
  return {
    ...object,
    importSourceId,
    updatedAt: now,
    sync: {
      ...object.sync,
      revision: object.sync.revision + 1,
      baseRevision: object.sync.revision,
      updatedByDeviceId: deviceId,
      state: 'dirty'
    }
  }
}

function findItemMatch(
  source: ExternalImportItem,
  existingItems: VaultItem[],
  consumedIds: Set<string>
): VaultItem | null {
  if (source.sourceId) {
    const sourceMatch = existingItems.find((item) =>
      !consumedIds.has(item.id) && item.importSourceId === source.sourceId
    )
    if (sourceMatch) return sourceMatch
  }

  const fingerprint = externalItemFingerprint(source)
  return existingItems.find((item) =>
    !consumedIds.has(item.id) &&
    !item.importSourceId &&
    vaultItemFingerprint(item) === fingerprint
  ) ?? null
}

function activeItemsForVault(items: VaultItem[], vaultId: string): VaultItem[] {
  return items.filter((item) => item.vaultId === vaultId && !item.sync.deletedAt)
}

function itemFingerprintsContained(source: string[], existing: string[]): boolean {
  if (source.length === 0) return existing.length === 0
  if (source.length > existing.length) return false
  const remaining = new Map<string, number>()
  for (const fingerprint of existing) {
    remaining.set(fingerprint, (remaining.get(fingerprint) ?? 0) + 1)
  }
  for (const fingerprint of source) {
    const count = remaining.get(fingerprint) ?? 0
    if (count === 0) return false
    if (count === 1) remaining.delete(fingerprint)
    else remaining.set(fingerprint, count - 1)
  }
  return true
}

function externalItemFingerprint(item: ExternalImportItem): string {
  return JSON.stringify({
    type: item.type,
    title: item.title.trim(),
    notes: item.notes.trim(),
    urls: [...item.urls.filter(Boolean)].sort(),
    fields: item.fields
      .filter((field) => field.kind !== 'url')
      .map((field) => ({
        kind: field.kind,
        value: field.value,
        sensitive: field.sensitive
      }))
      .sort(compareFingerprintValues)
  })
}

function vaultItemFingerprint(item: VaultItem): string {
  return JSON.stringify({
    type: item.type,
    title: item.title.trim(),
    notes: item.notes.trim(),
    urls: [...item.urls.filter(Boolean)].sort(),
    fields: item.fields.filter((field) => field.kind !== 'url').map(fieldFingerprint).sort(compareFingerprintValues)
  })
}

function fieldFingerprint(field: VaultItemField): Record<string, unknown> {
  return {
    kind: field.kind,
    value: field.value,
    sensitive: field.sensitive,
    ...(field.children?.length ? { children: field.children.map(fieldFingerprint).sort(compareFingerprintValues) } : {})
  }
}

function compareFingerprintValues(left: unknown, right: unknown): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right))
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}
