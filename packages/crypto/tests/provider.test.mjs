import assert from 'node:assert/strict'
import { WebVaultCryptoProvider, generateSecretKey } from '../dist/index.js'
import { deriveUnlockKey } from '../dist/kdf.js'

const compatibilityKey = await deriveUnlockKey(
  'pässword-测试',
  'LP-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789-ABCD-EFGH-JKLM-NPQR-STUV',
  {
    version: 1,
    name: 'argon2id',
    memoryKiB: 32_768,
    iterations: 2,
    parallelism: 1,
    salt: 'AQIDBAUGBwgJCgsMDQ4PEA',
    keyLengthBytes: 32,
    inputEncoding: 'domain-tagged-length-prefixed-utf8',
    passwordNormalization: 'NFKC',
    purpose: 'lockpass unlock v1'
  }
)
assert.equal(Buffer.from(compatibilityKey).toString('base64url'), 'gMxV5ElgDK2gIkGmdue7IP0xmPJag2wc57pOIjFh6LA')
compatibilityKey.fill(0)

const provider = new WebVaultCryptoProvider()
const password = 'correct horse battery staple'
const secretKey = generateSecretKey()
const created = await provider.createUser({
  userId: 'user-test',
  password,
  secretKey,
  vaultId: 'vault-test'
})
const metadata = {
  objectType: 'vault_item',
  objectId: 'item-test',
  vaultId: 'vault-test',
  revision: 1
}
const payload = { title: 'Example', username: 'alice', password: 'secret' }
const envelope = await provider.encryptObject(created.sessionId, created.crypto.keyId, metadata, payload)

assert.deepEqual(
  await provider.decryptObject(created.sessionId, created.crypto.keyId, metadata, envelope),
  payload
)

await provider.softLock(created.sessionId)
await assert.rejects(
  provider.decryptObject(created.sessionId, created.crypto.keyId, metadata, envelope),
  /locked/
)
assert.equal(await provider.resume(created.sessionId, 'wrong password'), false)
assert.equal(await provider.resume(created.sessionId, password), true)

const fastUnlock = await provider.createDeviceFastUnlock({
  accountId: 'account-test',
  userId: 'user-test',
  deviceId: 'device-test',
  vaultId: 'vault-test',
  keyId: created.crypto.keyId,
  sessionId: created.sessionId
})
await provider.closeSession(created.sessionId)

const unlocked = await provider.unlockWithDeviceKey({
  userId: 'user-test',
  deviceId: 'device-test',
  deviceUnlockKey: fastUnlock.deviceUnlockKey,
  cryptoConfig: { ...created.crypto, fastUnlock: fastUnlock.fastUnlock }
})
assert.deepEqual(
  await provider.decryptObject(unlocked.sessionId, created.crypto.keyId, metadata, envelope),
  payload
)

const tamperedEnvelope = { ...envelope, keyId: 'wrong-key' }
await assert.rejects(
  provider.decryptObject(unlocked.sessionId, created.crypto.keyId, metadata, tamperedEnvelope),
  /key does not match/
)

await provider.closeAllSessions()
