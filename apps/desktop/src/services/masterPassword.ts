import { argon2idAsync } from '@noble/hashes/argon2.js'
import { invoke } from '@tauri-apps/api/core'
import type { Vault, VaultAttachment, VaultItem } from '@lockpass/core'
import type { PerfTrace } from '@/services/perfTrace'

export interface KdfParams {
  version: 1
  name: 'argon2id'
  memoryKiB: number
  iterations: number
  parallelism: number
  salt: string
  keyLengthBytes: number
  inputEncoding: 'domain-tagged-length-prefixed-utf8'
  passwordNormalization: 'NFKC'
  purpose: 'lockpass unlock v1'
}

export interface CryptoEnvelope<Aad extends Record<string, unknown> = Record<string, unknown>> {
  version: 1
  alg: 'AES-256-GCM'
  keyId: string
  nonce: string
  aad: Aad
  ciphertext: string
  tag: string
}

export interface DesktopVaultPayload {
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
}

export type WrappedVaultKey = CryptoEnvelope<{
  purpose: 'wrap-vault-key-v1'
  userId: string
  vaultId: string
  keyId: string
  kdfVersion: number
  schemaVersion: number
}>

export type DeviceWrappedVaultKey = CryptoEnvelope<{
  purpose: 'device-wrap-vault-key-v1'
  accountId: string
  userId: string
  deviceId: string
  vaultId: string
  keyId: string
  deviceKeyId: string
  schemaVersion: number
}>

export interface DeviceFastUnlock {
  version: 1
  accountId: string
  userId: string
  deviceId: string
  vaultId: string
  keyId: string
  deviceKeyId: string
  createdAt: string
  updatedAt: string
  deviceWrappedVaultKey: DeviceWrappedVaultKey
}

export type EncryptedAttachmentBlob = CryptoEnvelope<{
  purpose: 'encrypt-attachment-blob-v1'
  objectType: 'attachment_blob'
  objectId: string
  schemaVersion: number
  keyId: string
}>

export type SyncVaultObjectType = 'vault_item' | 'vault_attachment' | 'vault_metadata'

export type EncryptedSyncObjectPayload = CryptoEnvelope<{
  purpose: 'encrypt-vault-object-v1'
  objectType: SyncVaultObjectType
  objectId: string
  vaultId: string
  schemaVersion: number
  keyId: string
  revision: number
}>

export interface DesktopUserCrypto {
  keyId: string
  kdfParams: KdfParams
  wrappedVaultKey: WrappedVaultKey
  fastUnlock?: DeviceFastUnlock | null
}

const UNLOCK_PURPOSE = 'lockpass unlock v1'
const WRAP_SCHEMA_VERSION = 1
const DEVICE_WRAP_SCHEMA_VERSION = 1
const LOCAL_PAYLOAD_SCHEMA_VERSION = 2
const KEY_BYTES = 32
const SALT_BYTES = 16
const NONCE_BYTES = 12
const TAG_BYTES = 16
const RECOVERY_KEY_BYTES = 32
const RECOVERY_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ARGON2_DEFAULT_MEMORY_KIB = 32_768
const ARGON2_DEFAULT_ITERATIONS = 2
const ARGON2_DEFAULT_PARALLELISM = 1

export function createKdfParams(): KdfParams {
  return {
    version: 1,
    name: 'argon2id',
    memoryKiB: ARGON2_DEFAULT_MEMORY_KIB,
    iterations: ARGON2_DEFAULT_ITERATIONS,
    parallelism: ARGON2_DEFAULT_PARALLELISM,
    salt: bytesToBase64url(randomBytes(SALT_BYTES)),
    keyLengthBytes: KEY_BYTES,
    inputEncoding: 'domain-tagged-length-prefixed-utf8',
    passwordNormalization: 'NFKC',
    purpose: UNLOCK_PURPOSE
  }
}

function usesCurrentKdfProfile(params: KdfParams): boolean {
  return params.version === 1
    && params.name === 'argon2id'
    && params.memoryKiB === ARGON2_DEFAULT_MEMORY_KIB
    && params.iterations === ARGON2_DEFAULT_ITERATIONS
    && params.parallelism === ARGON2_DEFAULT_PARALLELISM
    && params.keyLengthBytes === KEY_BYTES
    && params.inputEncoding === 'domain-tagged-length-prefixed-utf8'
    && params.passwordNormalization === 'NFKC'
    && params.purpose === UNLOCK_PURPOSE
}

export function generateRecoveryKey(): string {
  return `LP-${formatRecoveryKey(bytesToRecoveryKeyText(randomBytes(RECOVERY_KEY_BYTES)))}`
}

export function generateVaultKey(): Uint8Array {
  return randomBytes(KEY_BYTES)
}

export function generateDeviceUnlockKey(): string {
  return bytesToBase64url(randomBytes(KEY_BYTES))
}

export function serverUuidFromLocalId(id: string): string | null {
  const match = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  return match ? match[0].toLowerCase() : null
}

export function requireServerUuidFromLocalId(id: string): string {
  const uuid = serverUuidFromLocalId(id)
  if (!uuid) throw new Error('syncUnsupportedId')
  return uuid
}

export async function deriveUnlockKey(password: string, recoveryKey: string, params: KdfParams, perf?: PerfTrace): Promise<Uint8Array> {
  assertSupportedKdf(params)

  if (isTauriRuntime()) {
    const derived = await perfMeasure(perf, 'kdf.argon2id.rust', () => invoke<string>('derive_unlock_key_argon2id', { password, recoveryKey, params }))
    return base64urlToBytes(derived)
  }

  const input = encodeUnlockInput(password, recoveryKey)
  const salt = base64urlToBytes(params.salt)
  const derived = await perfMeasure(perf, 'kdf.argon2id.js', () => argon2idAsync(input, salt, {
    t: params.iterations,
    m: params.memoryKiB,
    p: params.parallelism,
    dkLen: params.keyLengthBytes,
    asyncTick: 10,
    maxmem: 256 * 1024 * 1024
  }))

  return copyBytes(derived)
}

export async function createUserCrypto(
  userId: string,
  password: string,
  payload?: DesktopVaultPayload,
  recoveryKey = generateRecoveryKey()
): Promise<{ crypto: DesktopUserCrypto; recoveryKey: string; vaultKey: Uint8Array }> {
  const keyId = `key-${crypto.randomUUID()}`
  const kdfParams = createKdfParams()
  const unlockKey = await deriveUnlockKey(password, recoveryKey, kdfParams)
  const vaultKey = generateVaultKey()
  const localVaultId = payload?.vaults.find((vault) => !vault.sync.deletedAt)?.id
  const vaultId = localVaultId ? serverUuidFromLocalId(localVaultId) ?? crypto.randomUUID() : crypto.randomUUID()

  return {
    crypto: {
      keyId,
      kdfParams,
      wrappedVaultKey: await wrapVaultKey(unlockKey, vaultKey, userId, vaultId, keyId, kdfParams)
    },
    recoveryKey,
    vaultKey
  }
}

export async function unlockUserCrypto(
  userId: string,
  password: string,
  recoveryKey: string,
  cryptoConfig: DesktopUserCrypto,
  perf?: PerfTrace
): Promise<{ vaultKey: Uint8Array; payload: DesktopVaultPayload }> {
  const unlockKey = await deriveUnlockKey(password, recoveryKey, cryptoConfig.kdfParams, perf)
  const vaultId = cryptoConfig.wrappedVaultKey.aad.vaultId || userId
  const vaultKey = await perfMeasure(perf, 'crypto.unwrapVaultKey', () =>
    unwrapVaultKey(unlockKey, cryptoConfig.wrappedVaultKey, userId, vaultId, cryptoConfig.keyId, cryptoConfig.kdfParams)
  )
  return { vaultKey, payload: emptyDesktopVaultPayload() }
}

export async function createDeviceFastUnlock(
  input: {
    accountId: string
    userId: string
    deviceId: string
    vaultId: string
    keyId: string
    vaultKey: Uint8Array
  },
  now = new Date().toISOString()
): Promise<{ fastUnlock: DeviceFastUnlock; deviceUnlockKey: string }> {
  const deviceKeyId = `device-key-${crypto.randomUUID()}`
  const deviceUnlockKey = generateDeviceUnlockKey()
  const aad = deviceFastUnlockAad({
    accountId: input.accountId,
    userId: input.userId,
    deviceId: input.deviceId,
    vaultId: input.vaultId,
    keyId: input.keyId,
    deviceKeyId
  })

  return {
    fastUnlock: {
      version: 1,
      accountId: input.accountId,
      userId: input.userId,
      deviceId: input.deviceId,
      vaultId: input.vaultId,
      keyId: input.keyId,
      deviceKeyId,
      createdAt: now,
      updatedAt: now,
      deviceWrappedVaultKey: await encryptEnvelope(base64urlToBytes(deviceUnlockKey), input.vaultKey, aad, deviceKeyId)
    },
    deviceUnlockKey
  }
}

export async function unlockUserCryptoWithDeviceUnlockKey(
  userId: string,
  deviceId: string,
  deviceUnlockKey: string,
  cryptoConfig: DesktopUserCrypto,
  perf?: PerfTrace
): Promise<{ vaultKey: Uint8Array; payload: DesktopVaultPayload }> {
  const fastUnlock = cryptoConfig.fastUnlock
  if (!fastUnlock || fastUnlock.version !== 1) throw new Error('Trusted device fast unlock is not configured')
  if (fastUnlock.userId !== userId || fastUnlock.deviceId !== deviceId || fastUnlock.keyId !== cryptoConfig.keyId) {
    throw new Error('Trusted device fast unlock metadata does not match')
  }

  const vaultKey = await perfMeasure(perf, 'crypto.unwrapDeviceVaultKey', () =>
    decryptEnvelope(base64urlToBytes(deviceUnlockKey), fastUnlock.deviceWrappedVaultKey, deviceFastUnlockAad(fastUnlock))
  )
  return { vaultKey, payload: emptyDesktopVaultPayload() }
}

export async function encryptAttachmentBytes(
  vaultKey: Uint8Array,
  keyId: string,
  attachmentId: string,
  bytes: Uint8Array
): Promise<EncryptedAttachmentBlob> {
  return encryptEnvelope(
    vaultKey,
    bytes,
    {
      purpose: 'encrypt-attachment-blob-v1',
      objectType: 'attachment_blob',
      objectId: attachmentId,
      schemaVersion: LOCAL_PAYLOAD_SCHEMA_VERSION,
      keyId
    },
    keyId
  )
}

export async function decryptAttachmentBytes(
  vaultKey: Uint8Array,
  keyId: string,
  attachmentId: string,
  envelope: EncryptedAttachmentBlob
): Promise<Uint8Array> {
  return decryptEnvelope(vaultKey, envelope, {
    purpose: 'encrypt-attachment-blob-v1',
    objectType: 'attachment_blob',
    objectId: attachmentId,
    schemaVersion: LOCAL_PAYLOAD_SCHEMA_VERSION,
    keyId
  })
}

export async function encryptSyncObjectPayload(
  vaultKey: Uint8Array,
  keyId: string,
  metadata: {
    objectType: SyncVaultObjectType
    objectId: string
    vaultId: string
    revision: number
  },
  payload: unknown
): Promise<EncryptedSyncObjectPayload> {
  return encryptEnvelope(
    vaultKey,
    utf8ToBytes(stableStringify(payload)),
    {
      purpose: 'encrypt-vault-object-v1',
      objectType: metadata.objectType,
      objectId: metadata.objectId,
      vaultId: metadata.vaultId,
      schemaVersion: 1,
      keyId,
      revision: metadata.revision
    },
    keyId
  )
}

export async function decryptSyncObjectPayload<T>(
  vaultKey: Uint8Array,
  keyId: string,
  metadata: {
    objectType: SyncVaultObjectType
    objectId: string
    vaultId: string
    revision: number
  },
  envelope: EncryptedSyncObjectPayload
): Promise<T> {
  const plaintext = await decryptEnvelope(vaultKey, envelope, {
    purpose: 'encrypt-vault-object-v1',
    objectType: metadata.objectType,
    objectId: metadata.objectId,
    vaultId: metadata.vaultId,
    schemaVersion: 1,
    keyId,
    revision: metadata.revision
  })

  return JSON.parse(bytesToUtf8(plaintext)) as T
}

export function serializeEnvelope(envelope: CryptoEnvelope): Uint8Array {
  return utf8ToBytes(stableStringify(envelope))
}

export function parseAttachmentEnvelope(bytes: Uint8Array): EncryptedAttachmentBlob {
  return JSON.parse(bytesToUtf8(bytes)) as EncryptedAttachmentBlob
}

export function fingerprintKey(key: Uint8Array): string {
  return bytesToBase64url(key).slice(0, 16)
}

async function wrapVaultKey(
  unlockKey: Uint8Array,
  vaultKey: Uint8Array,
  userId: string,
  vaultId: string,
  keyId: string,
  kdfParams: KdfParams
): Promise<WrappedVaultKey> {
  return encryptEnvelope(
    unlockKey,
    vaultKey,
    {
      purpose: 'wrap-vault-key-v1',
      userId,
      vaultId,
      keyId,
      kdfVersion: kdfParams.version,
      schemaVersion: WRAP_SCHEMA_VERSION
    },
    keyId
  )
}

async function unwrapVaultKey(
  unlockKey: Uint8Array,
  envelope: WrappedVaultKey,
  userId: string,
  vaultId: string,
  keyId: string,
  kdfParams: KdfParams
): Promise<Uint8Array> {
  return decryptEnvelope(unlockKey, envelope, {
    purpose: 'wrap-vault-key-v1',
    userId,
    vaultId,
    keyId,
    kdfVersion: kdfParams.version,
    schemaVersion: WRAP_SCHEMA_VERSION
  })
}

function deviceFastUnlockAad(input: {
  accountId: string
  userId: string
  deviceId: string
  vaultId: string
  keyId: string
  deviceKeyId: string
}): DeviceWrappedVaultKey['aad'] {
  return {
    purpose: 'device-wrap-vault-key-v1',
    accountId: input.accountId,
    userId: input.userId,
    deviceId: input.deviceId,
    vaultId: input.vaultId,
    keyId: input.keyId,
    deviceKeyId: input.deviceKeyId,
    schemaVersion: DEVICE_WRAP_SCHEMA_VERSION
  }
}

async function encryptEnvelope<Aad extends Record<string, unknown>>(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
  aad: Aad,
  keyId: string
): Promise<CryptoEnvelope<Aad>> {
  const nonce = randomBytes(NONCE_BYTES)
  const key = await importAesKey(keyBytes)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: copyBytes(nonce),
        additionalData: copyBytes(utf8ToBytes(stableStringify(aad))),
        tagLength: 128
      },
      key,
      copyBytes(plaintext)
    )
  )

  return {
    version: 1,
    alg: 'AES-256-GCM',
    keyId,
    nonce: bytesToBase64url(nonce),
    aad,
    ciphertext: bytesToBase64url(encrypted.slice(0, encrypted.byteLength - TAG_BYTES)),
    tag: bytesToBase64url(encrypted.slice(encrypted.byteLength - TAG_BYTES))
  }
}

async function decryptEnvelope<Aad extends Record<string, unknown>>(
  keyBytes: Uint8Array,
  envelope: CryptoEnvelope<Aad>,
  expectedAad: Aad
): Promise<Uint8Array> {
  if (envelope.version !== 1 || envelope.alg !== 'AES-256-GCM') {
    throw new Error('Unsupported encrypted envelope')
  }
  if (stableStringify(envelope.aad) !== stableStringify(expectedAad)) {
    throw new Error('Encrypted envelope metadata does not match')
  }

  const ciphertext = base64urlToBytes(envelope.ciphertext)
  const tag = base64urlToBytes(envelope.tag)
  const encrypted = concatBytes(ciphertext, tag)
  const key = await importAesKey(keyBytes)
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: copyBytes(base64urlToBytes(envelope.nonce)),
      additionalData: copyBytes(utf8ToBytes(stableStringify(envelope.aad))),
      tagLength: 128
    },
    key,
    copyBytes(encrypted)
  )

  return new Uint8Array(plaintext)
}

async function importAesKey(bytes: Uint8Array): Promise<CryptoKey> {
  if (bytes.byteLength !== KEY_BYTES) throw new Error('AES-256-GCM key must be 32 bytes')
  return crypto.subtle.importKey('raw', copyBytes(bytes), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

function encodeUnlockInput(password: string, recoveryKey: string): Uint8Array {
  const domain = utf8ToBytes(UNLOCK_PURPOSE)
  const passwordBytes = utf8ToBytes(password.normalize('NFKC'))
  const recoveryKeyBytes = decodeRecoveryKey(recoveryKey)
  return concatBytes(domain, lengthPrefix(passwordBytes), passwordBytes, lengthPrefix(recoveryKeyBytes), recoveryKeyBytes)
}

function decodeRecoveryKey(value: string): Uint8Array {
  const normalized = normalizeRecoveryKeyText(value)
  if (!normalized) throw new Error('Secret Key is required')
  if (/^[A-HJ-NP-Z2-9]+$/i.test(normalized) && normalized.length === 52) {
    return recoveryKeyTextToBytes(normalized)
  }
  return base64urlToBytes(normalized)
}

function assertSupportedKdf(params: KdfParams): void {
  if (!usesCurrentKdfProfile(params)) {
    throw new Error('Unsupported or weak KDF parameters')
  }
}

function lengthPrefix(bytes: Uint8Array): Uint8Array {
  const prefix = new Uint8Array(4)
  new DataView(prefix.buffer).setUint32(0, bytes.byteLength, false)
  return prefix
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

function formatRecoveryKey(value: string): string {
  return value.match(/.{1,4}/g)?.join('-') ?? value
}

function normalizeRecoveryKeyText(value: string): string {
  const raw = value.trim().replace(/^LP-/i, '').replace(/\s/g, '')
  let normalized = ''
  let groupLength = 0

  for (const character of raw) {
    if (character === '-' && groupLength === 4) {
      groupLength = 0
      continue
    }

    normalized += character
    groupLength += 1
  }

  return normalized
}

function bytesToRecoveryKeyText(bytes: Uint8Array): string {
  let output = ''
  let buffer = 0
  let bits = 0

  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += RECOVERY_KEY_ALPHABET[(buffer >> bits) & 31]
      buffer &= (1 << bits) - 1
    }
  }

  if (bits > 0) {
    output += RECOVERY_KEY_ALPHABET[(buffer << (5 - bits)) & 31]
  }

  return output
}

function recoveryKeyTextToBytes(value: string): Uint8Array {
  const output: number[] = []
  let buffer = 0
  let bits = 0

  for (const character of value.toUpperCase()) {
    const index = RECOVERY_KEY_ALPHABET.indexOf(character)
    if (index < 0) throw new Error('Invalid Secret Key')

    buffer = (buffer << 5) | index
    bits += 5
    while (bits >= 8) {
      bits -= 8
      output.push((buffer >> bits) & 255)
      buffer &= (1 << bits) - 1
    }
  }

  if (output.length !== RECOVERY_KEY_BYTES) throw new Error('Invalid Secret Key length')
  return Uint8Array.from(output)
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const bytes = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64urlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = window.atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function emptyDesktopVaultPayload(): DesktopVaultPayload {
  return {
    vaults: [],
    items: [],
    attachments: []
  }
}

async function perfMeasure<T>(perf: PerfTrace | undefined, label: string, task: () => Promise<T>): Promise<T> {
  return perf ? perf.measure(label, task) : task()
}
