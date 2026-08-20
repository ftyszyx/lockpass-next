import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./UserManagementModal.vue', import.meta.url),
  'utf8',
)

assert.match(
  source,
  /t\('sync\.serverUrl'\)/,
  'account management should label the server URL',
)
assert.match(
  source,
  /user\.sync\?\.serverUrl\.trim\(\) \|\| t\('system\.serverUrlNotConfigured'\)/,
  'every local account row should display its associated server URL',
)
assert.match(
  source,
  /:title="userServerUrl\(user\)"/,
  'the complete server URL should remain available when the row truncates it',
)
assert.doesNotMatch(
  source,
  /new URL\(user\.sync\.serverUrl\)\.host/,
  'the account list should show the complete URL instead of only its host',
)

console.log('user management layout tests passed')
