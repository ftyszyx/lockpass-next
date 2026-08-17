import assert from 'node:assert/strict'
import { CORE_SCHEMA_VERSION, type VaultItem, type VaultItemType } from '@lockpass/core'
import { vaultItemMatchesListFilters } from './searchFilters'

function createItem(id: string, vaultId: string, type: VaultItemType, title: string): VaultItem {
  const timestamp = '2026-08-17T00:00:00.000Z'
  return {
    id,
    vaultId,
    schemaVersion: CORE_SCHEMA_VERSION,
    type,
    title,
    subtitle: '',
    notes: '',
    urls: [],
    tags: [],
    favorite: false,
    archived: false,
    fields: [],
    attachmentIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    sync: {
      revision: 0,
      baseRevision: 0,
      updatedByDeviceId: 'device-test',
      deletedAt: null,
      state: 'clean',
    },
  }
}

const selectedVaultItem = createItem('item-a', 'vault-a', 'login', 'Alpha')
const otherVaultItem = createItem('item-b', 'vault-b', 'login', 'LockPass')
const otherTypeItem = createItem('item-c', 'vault-b', 'secure-note', 'LockPass note')

assert.equal(vaultItemMatchesListFilters(otherVaultItem, [], {
  selectedVaultId: 'vault-a',
  selectedType: 'all',
  query: 'lock',
}), true, 'a search query should match items from another vault')

assert.equal(vaultItemMatchesListFilters(otherVaultItem, [], {
  selectedVaultId: 'vault-a',
  selectedType: 'all',
  query: '',
}), false, 'an empty query should keep the selected-vault scope')

assert.equal(vaultItemMatchesListFilters(selectedVaultItem, [], {
  selectedVaultId: 'vault-a',
  selectedType: 'all',
  query: '',
}), true, 'the selected vault should remain visible without a query')

assert.equal(vaultItemMatchesListFilters(otherTypeItem, [], {
  selectedVaultId: 'vault-a',
  selectedType: 'login',
  query: 'lock',
}), false, 'global search should retain the selected item type')

console.log('vault search filter tests passed')
