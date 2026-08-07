import assert from 'node:assert/strict'
import {
  assertExtensionAuthorizationTarget,
  createExtensionServerSettings,
  normalizeSelfHostServerUrl,
  normalizeStoredExtensionServerSettings
} from './extensionServer.ts'

assert.equal(normalizeSelfHostServerUrl('vault.example.com/'), 'https://vault.example.com')
assert.equal(normalizeSelfHostServerUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080')
assert.throws(() => normalizeSelfHostServerUrl(''), /server-url-required/)
assert.throws(() => normalizeSelfHostServerUrl('ftp://vault.example.com'), /server-url-invalid/)
assert.throws(() => normalizeSelfHostServerUrl('https://vault.example.com/base'), /server-url-invalid/)
assert.throws(() => normalizeSelfHostServerUrl('https://user:pass@vault.example.com'), /server-url-invalid/)
assert.throws(() => normalizeSelfHostServerUrl('https://vault.example.com?tenant=one'), /server-url-invalid/)

assert.deepEqual(createExtensionServerSettings({
  mode: 'selfhost',
  selfHostUrl: 'vault.example.com'
}), {
  mode: 'selfhost',
  selfHostUrl: 'https://vault.example.com'
})
assert.deepEqual(createExtensionServerSettings({
  mode: 'official',
  selfHostUrl: 'vault.example.com'
}), {
  mode: 'official',
  selfHostUrl: 'https://vault.example.com'
})
assert.deepEqual(normalizeStoredExtensionServerSettings({
  mode: 'selfhost',
  selfHostUrl: 'invalid url'
}), {
  mode: 'official',
  selfHostUrl: ''
})

const authorization = {
  mode: 'selfhost' as const,
  serverUrl: 'https://vault.example.com/',
  account: { id: 'account-1', displayName: 'user@example.com' },
  device: { id: 'device-1', name: 'Browser' },
  deviceToken: 'token',
  tokenType: 'Bearer'
}
assert.doesNotThrow(() => assertExtensionAuthorizationTarget(authorization, {
  mode: 'selfhost',
  apiUrl: 'https://vault.example.com'
}))
assert.throws(() => assertExtensionAuthorizationTarget(authorization, {
  mode: 'official',
  apiUrl: 'https://vault.example.com'
}), /authorization-server-mismatch/)

console.log('extension server settings tests passed')
