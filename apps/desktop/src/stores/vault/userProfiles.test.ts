import assert from 'node:assert/strict'
import type { DesktopUserProfile } from '@/services/vaultRepository'
import {
  deduplicateUserProfiles,
  findServerAccountUser,
  upsertServerAccountUser,
  withServerAccountSetupLock,
} from './userProfiles'

function user(
  id: string,
  accountId: string | null = null,
  displayName = id,
  serverUrl = 'https://api-one.example.com',
): DesktopUserProfile {
  return {
    id,
    username: displayName.toLowerCase(),
    displayName,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sync: { accountId, serverUrl } as DesktopUserProfile['sync'],
    crypto: null,
  }
}

const first = user('account-one', 'account-one', 'one')
const second = user('account-two', 'account-two', 'two')

assert.deepEqual(
  deduplicateUserProfiles([first, second, { ...first, displayName: 'updated one' }])
    .map((item) => [item.id, item.displayName]),
  [['account-one', 'updated one'], ['account-two', 'two']],
)
assert.equal(
  findServerAccountUser([first, second], 'https://api-one.example.com', 'account-two')?.id,
  'account-two',
)

const sameAccountOtherServer = user(
  'server-user-other',
  'account-one',
  'other server',
  'https://api-two.example.com',
)
assert.equal(
  findServerAccountUser(
    [first, sameAccountOtherServer],
    'https://api-two.example.com',
    'account-one',
  )?.id,
  'server-user-other',
)

const updatedSecond = {
  ...second,
  displayName: 'updated two',
  updatedAt: '2026-01-02T00:00:00.000Z',
}
assert.deepEqual(
  upsertServerAccountUser([first, second], updatedSecond).map((item) => item.displayName),
  ['one', 'updated two'],
)
assert.deepEqual(
  upsertServerAccountUser([first], second).map((item) => item.id),
  ['account-one', 'account-two'],
)
assert.deepEqual(
  upsertServerAccountUser([first], sameAccountOtherServer).map((item) => item.id),
  ['account-one', 'server-user-other'],
)

let repeatedSetupCalls = 0
const repeatedSetup = () => withServerAccountSetupLock(
  'https://api-one.example.com',
  'account-one',
  'restore',
  async () => {
    repeatedSetupCalls += 1
    await Promise.resolve()
    return 'ready'
  },
)
assert.deepEqual(await Promise.all([repeatedSetup(), repeatedSetup()]), ['ready', 'ready'])
assert.equal(repeatedSetupCalls, 1)

const setupOrder: string[] = []
await Promise.all([
  withServerAccountSetupLock('https://api-one.example.com', 'account-two', 'restore', async () => {
    setupOrder.push('two:start')
    await Promise.resolve()
    setupOrder.push('two:end')
  }),
  withServerAccountSetupLock('https://api-one.example.com', 'account-three', 'restore', async () => {
    setupOrder.push('three:start')
    setupOrder.push('three:end')
  }),
])
assert.deepEqual(setupOrder, ['two:start', 'two:end', 'three:start', 'three:end'])

let crossServerSetupCalls = 0
await Promise.all([
  withServerAccountSetupLock('https://api-one.example.com', 'shared-account', 'create', async () => {
    crossServerSetupCalls += 1
  }),
  withServerAccountSetupLock('https://api-two.example.com', 'shared-account', 'create', async () => {
    crossServerSetupCalls += 1
  }),
])
assert.equal(crossServerSetupCalls, 2)

console.log('user profile tests passed')
