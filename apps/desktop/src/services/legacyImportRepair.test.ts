import assert from 'node:assert/strict'
import { CORE_SCHEMA_VERSION, type VaultItem } from '@lockpass/core'
import { fieldsWithoutRedundantLegacyNote } from './legacyImportRepair'

const item: VaultItem = {
  id: 'item-one',
  vaultId: 'vault-one',
  schemaVersion: CORE_SCHEMA_VERSION,
  importSourceId: 'legacy-lockpass:item:source-one',
  type: 'secure-note',
  title: 'Legacy note',
  subtitle: '',
  notes: 'Only one copy',
  urls: [],
  tags: [],
  favorite: false,
  archived: false,
  fields: [
    { id: 'duplicate', kind: 'note', label: 'Note', value: 'Only one copy', sensitive: false },
    { id: 'other', kind: 'text', label: 'Other', value: 'Keep me', sensitive: false },
  ],
  attachmentIds: [],
  createdAt: '2026-08-17T00:00:00.000Z',
  updatedAt: '2026-08-17T00:00:00.000Z',
  sync: {
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: 'device-one',
    deletedAt: null,
    state: 'clean',
  },
}

assert.deepEqual(
  fieldsWithoutRedundantLegacyNote(item).map((field) => field.id),
  ['other'],
)
assert.equal(
  fieldsWithoutRedundantLegacyNote({ ...item, importSourceId: undefined }).length,
  2,
  'non-legacy items should retain explicitly added fields',
)

console.log('legacy import repair tests passed')
