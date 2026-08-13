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
): DesktopUserProfile {
  return {
    id,
    username: displayName.toLowerCase(),
    displayName,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    sync: { accountId } as DesktopUserProfile['sync'],
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
assert.equal(findServerAccountUser([first, second], 'account-two')?.id, 'account-two')

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

let repeatedSetupCalls = 0
const repeatedSetup = () => withServerAccountSetupLock('account-one', 'restore', async () => {
  repeatedSetupCalls += 1
  await Promise.resolve()
  return 'ready'
})
assert.deepEqual(await Promise.all([repeatedSetup(), repeatedSetup()]), ['ready', 'ready'])
assert.equal(repeatedSetupCalls, 1)

const setupOrder: string[] = []
await Promise.all([
  withServerAccountSetupLock('account-two', 'restore', async () => {
    setupOrder.push('two:start')
    await Promise.resolve()
    setupOrder.push('two:end')
  }),
  withServerAccountSetupLock('account-three', 'restore', async () => {
    setupOrder.push('three:start')
    setupOrder.push('three:end')
  }),
])
assert.deepEqual(setupOrder, ['two:start', 'two:end', 'three:start', 'three:end'])

console.log('user profile tests passed')
