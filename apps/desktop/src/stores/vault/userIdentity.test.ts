import assert from 'node:assert/strict'
import type { DesktopUserProfile } from '@/services/vaultRepository'
import {
  canonicalServerUrl,
  cryptoUserIdForUser,
  serverAccountIdentityKey,
  serverAccountLocalUserId,
} from './userIdentity'

assert.equal(
  canonicalServerUrl('HTTPS://API.Example.com:443/v1/'),
  'https://api.example.com/v1',
)
assert.equal(
  serverAccountIdentityKey('https://api.example.com/', ' account-one '),
  'https://api.example.com\0account-one',
)

const firstId = await serverAccountLocalUserId('https://api-one.example.com', 'shared-account')
const repeatedId = await serverAccountLocalUserId('https://api-one.example.com/', 'shared-account')
const otherServerId = await serverAccountLocalUserId('https://api-two.example.com', 'shared-account')

assert.equal(firstId, repeatedId)
assert.notEqual(firstId, otherServerId)
assert.match(firstId, /^server-user-[a-f0-9]{64}$/)

const serverUser = {
  id: firstId,
  username: 'person@example.com',
  displayName: 'person@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  sync: {
    accountId: 'shared-account',
    serverUrl: 'https://api-one.example.com',
  },
  crypto: {
    wrappedVaultKey: {
      aad: {
        userId: 'crypto-account-id',
      },
    },
  },
} as DesktopUserProfile

assert.equal(cryptoUserIdForUser(serverUser), 'crypto-account-id')
assert.equal(
  cryptoUserIdForUser({ ...serverUser, crypto: null }),
  'shared-account',
)

console.log('user identity tests passed')
