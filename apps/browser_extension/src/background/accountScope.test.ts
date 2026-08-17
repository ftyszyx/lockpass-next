import assert from 'node:assert/strict'
import {
  canonicalAccountServerUrl,
  serverAccountStorageScope
} from './accountScope.ts'

assert.equal(
  canonicalAccountServerUrl('HTTPS://API.Example.com:443/v1/'),
  'https://api.example.com/v1'
)
assert.equal(
  serverAccountStorageScope('https://api.example.com/', 'account-one'),
  serverAccountStorageScope('https://api.example.com', 'account-one')
)
assert.notEqual(
  serverAccountStorageScope('https://api-one.example.com', 'shared-account'),
  serverAccountStorageScope('https://api-two.example.com', 'shared-account')
)

console.log('extension account scope tests passed')
