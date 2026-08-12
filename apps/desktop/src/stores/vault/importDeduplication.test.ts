import assert from 'node:assert/strict'
import type { Vault, VaultItem } from '@lockpass/core'
import type { ExternalImportItem, ExternalImportVault } from '@/services/backup'
import {
  attachImportSource,
  findPreviouslyImportedVault,
  partitionImportedItems
} from './importDeduplication'

const now = '2026-08-12T00:00:00.000Z'
const sync = {
  revision: 1,
  baseRevision: 0,
  updatedByDeviceId: 'device-one',
  deletedAt: null,
  state: 'clean' as const
}

function externalItem(sourceId = 'source-item-one'): ExternalImportItem {
  return {
    sourceId,
    type: 'login',
    title: 'Example',
    notes: '',
    urls: ['https://example.com'],
    fields: [
      { kind: 'url', label: 'Website', value: 'https://example.com', sensitive: false },
      { kind: 'username', label: 'Username', value: 'alice', sensitive: false }
    ]
  }
}

function vault(importSourceId?: string): Vault {
  return {
    id: 'vault-one',
    schemaVersion: 1,
    importSourceId,
    name: 'Imported vault',
    description: '',
    color: 'slate',
    icon: 'folder-lock',
    createdAt: now,
    updatedAt: now,
    sync: { ...sync }
  }
}

function vaultItem(importSourceId?: string): VaultItem {
  return {
    id: 'item-one',
    vaultId: 'vault-one',
    schemaVersion: 1,
    importSourceId,
    type: 'login',
    title: 'Example',
    subtitle: '',
    notes: '',
    urls: ['https://example.com'],
    tags: [],
    favorite: false,
    archived: false,
    fields: [{ id: 'field-one', kind: 'username', label: 'Username', value: 'alice', sensitive: false }],
    attachmentIds: [],
    createdAt: now,
    updatedAt: now,
    sync: { ...sync }
  }
}

const sourceVault: ExternalImportVault = {
  sourceId: 'source-vault-one',
  name: 'Imported vault',
  items: [externalItem()]
}

assert.equal(findPreviouslyImportedVault(sourceVault, [vault('source-vault-one')], [])?.id, 'vault-one')
assert.equal(findPreviouslyImportedVault(sourceVault, [vault()], [vaultItem()])?.id, 'vault-one')

const sourceMatch = partitionImportedItems([externalItem()], [vaultItem('source-item-one')])
assert.equal(sourceMatch.matches.length, 1)
assert.equal(sourceMatch.missing.length, 0)

const contentMatch = partitionImportedItems([externalItem()], [vaultItem()])
assert.equal(contentMatch.matches.length, 1)
assert.equal(contentMatch.missing.length, 0)

const missing = partitionImportedItems([externalItem('source-item-two')], [vaultItem('source-item-one')])
assert.equal(missing.matches.length, 0)
assert.equal(missing.missing.length, 1)

assert.equal(
  findPreviouslyImportedVault(
    { ...sourceVault, items: [] },
    [vault()],
    []
  ),
  null
)

const attached = attachImportSource(vault(), 'source-vault-one', now, 'device-two')
assert.equal(attached.importSourceId, 'source-vault-one')
assert.equal(attached.sync.revision, 2)
assert.equal(attached.sync.state, 'dirty')

console.log('vault import deduplication tests passed')
