import assert from 'node:assert/strict'
import type { VaultItem } from '@lockpass/core'
import { buildExtensionVaultItem, withCleanItemSync } from './itemMutationModel.ts'

const deviceId = '95becfb2-1d6a-44a0-a3ba-b540f92c20fc'
const vaultId = 'vault-5f8e19de-5809-42b0-94e6-f47ffb76cf87'
const now = '2026-08-06T12:00:00.000Z'

const created = buildExtensionVaultItem({
  editingItemId: null,
  vaultId,
  type: 'login',
  title: 'Example',
  notes: '',
  fields: [
    { id: 'url', kind: 'url', label: 'Website', value: 'https://example.com', sensitive: false },
    { id: 'user', kind: 'username', label: 'Username', value: 'user@example.com', sensitive: false },
    { id: 'password', kind: 'password', label: 'Password', value: ' secret ', sensitive: true }
  ]
}, null, deviceId, now)

assert.equal(created.urls[0], 'https://example.com')
assert.equal(created.fields.some((field) => field.kind === 'url'), false)
assert.equal(created.fields.find((field) => field.kind === 'password')?.value, ' secret ')
assert.equal(created.sync.revision, 1)
assert.equal(created.sync.baseRevision, 0)
assert.equal(created.subtitle, 'user@example.com / https://example.com')

const existing: VaultItem = {
  ...created,
  id: 'item-598b0e26-3e78-47bd-970d-68c57c31a3d8',
  favorite: true,
  attachmentIds: ['attachment-1'],
  sync: { ...created.sync, revision: 4, baseRevision: 4, state: 'clean' }
}
const edited = buildExtensionVaultItem({
  editingItemId: existing.id,
  vaultId,
  type: 'login',
  title: 'Updated',
  notes: 'note',
  fields: created.fields
}, existing, deviceId, now)

assert.equal(edited.favorite, true)
assert.deepEqual(edited.attachmentIds, ['attachment-1'])
assert.equal(edited.sync.revision, 5)
assert.equal(edited.sync.baseRevision, 4)
assert.equal(withCleanItemSync(edited, 5).sync.state, 'clean')

console.log('extension item mutation model tests passed')
