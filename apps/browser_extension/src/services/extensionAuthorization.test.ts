import assert from 'node:assert/strict'
import { parseExtensionAuthorizationCallback } from './extensionAuthorization.ts'

const redirectUrl = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/auth/callback'
const payload = {
  mode: 'official',
  serverUrl: 'https://api.example.com',
  account: { id: 'account-1', displayName: 'user@example.com', email: 'user@example.com' },
  device: { id: 'device-1', clientDeviceId: 'extension-1', name: 'LockPass Browser Extension' },
  deviceToken: 'device-token',
  tokenType: 'Bearer'
}
const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')

assert.deepEqual(
  parseExtensionAuthorizationCallback(`${redirectUrl}?payload=${encoded}`, redirectUrl),
  payload
)
assert.throws(
  () => parseExtensionAuthorizationCallback(`https://example.com/auth/callback?payload=${encoded}`, redirectUrl),
  /authorization-callback-mismatch/
)
assert.throws(
  () => parseExtensionAuthorizationCallback(`${redirectUrl}?payload=invalid`, redirectUrl),
  /authorization-payload-invalid/
)

console.log('extension authorization tests passed')
