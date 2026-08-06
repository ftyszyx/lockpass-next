import assert from 'node:assert/strict'
import type { VaultItem } from '@lockpass/core'
import { itemMatchesOrigin, normalizeOrigin } from './originMatcher.ts'

const item: VaultItem = {
  id: 'item-1',
  vaultId: 'vault-1',
  schemaVersion: 1,
  type: 'login',
  title: 'Example',
  subtitle: 'user@example.com',
  notes: '',
  urls: ['https://accounts.example.com/login'],
  tags: [],
  favorite: false,
  archived: false,
  fields: [],
  attachmentIds: [],
  createdAt: '2026-08-06T00:00:00.000Z',
  updatedAt: '2026-08-06T00:00:00.000Z',
  sync: {
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: 'device-1',
    deletedAt: null,
    state: 'clean'
  }
}

assert.equal(normalizeOrigin('https://Accounts.Example.com/login'), 'https://accounts.example.com')
assert.equal(itemMatchesOrigin(item, 'https://accounts.example.com'), true)
assert.equal(itemMatchesOrigin(item, 'https://example-login.com'), false)
assert.equal(itemMatchesOrigin({ ...item, archived: true }, 'https://accounts.example.com'), false)

console.log('origin matcher tests passed')
