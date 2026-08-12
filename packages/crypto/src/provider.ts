import {
  base64urlToBytes,
  bytesToBase64url,
  bytesToUtf8,
  randomBytes,
  stableStringify,
  utf8ToBytes
} from './encoding.js'
import { decryptEnvelope, encryptEnvelope } from './envelope.js'
import { createKdfParams, deriveUnlockKey } from './kdf.js'
import { attachmentInfo, deviceFastUnlockInfo, objectInfo, vaultKeyInfo } from './metadata.js'
import { VaultSessionStore } from './sessionStore.js'
import type {
  CreateDeviceFastUnlockInput,
  ChangeUserPasswordInput,
  CreateUserInput,
  CryptoEnvelope,
  DeviceFastUnlock,
  DeviceUnlockInput,
  EncryptedAttachmentBlob,
  EncryptedSyncObjectPayload,
  UserCryptoConfig,
  VaultCryptoProvider,
  VaultObjectMetadata,
} from './types.js'

const KEY_BYTES = 32

export class WebVaultCryptoProvider implements VaultCryptoProvider {
  private readonly sessions = new VaultSessionStore()

  async createUser(input: CreateUserInput): Promise<{ crypto: UserCryptoConfig; sessionId: string }> {
    const keyId = `key-${crypto.randomUUID()}`
    const kdfParams = createKdfParams()
    const unlockKey = await deriveUnlockKey(input.password, input.secretKey, kdfParams)
    const vaultKey = randomBytes(KEY_BYTES)

    try {
      const wrappedVaultKey = await encryptEnvelope(
        unlockKey,
        vaultKey,
        vaultKeyInfo(input.userId, input.vaultId, keyId, kdfParams),
        keyId
      )
      const sessionId = await this.sessions.open(input.userId, keyId, vaultKey, input.password)
      return { crypto: { keyId, kdfParams, wrappedVaultKey }, sessionId }
    } finally {
      unlockKey.fill(0)
      vaultKey.fill(0)
    }
  }

  async unlockUser(input: {
    userId: string
    password: string
    secretKey: string
    cryptoConfig: UserCryptoConfig
  }): Promise<{ sessionId: string }> {
    const vaultKey = await this.decryptVaultKey(input)
    try {
      return { sessionId: await this.sessions.open(input.userId, input.cryptoConfig.keyId, vaultKey, input.password) }
    } finally {
      vaultKey.fill(0)
    }
  }

  async verifyCredentials(input: {
    userId: string
    password: string
    secretKey: string
    cryptoConfig: UserCryptoConfig
  }): Promise<boolean> {
    try {
      const vaultKey = await this.decryptVaultKey(input)
      vaultKey.fill(0)
      return true
    } catch {
      return false
    }
  }

  async changeUserPassword(input: ChangeUserPasswordInput): Promise<UserCryptoConfig> {
    const session = this.sessions.requireUnlocked(input.sessionId, input.cryptoConfig.keyId)
    if (session.userId !== input.userId) throw new Error('Vault session user does not match')
    if (!await this.sessions.verifyPassword(input.sessionId, input.password)) {
      throw new Error('Current password is incorrect')
    }
    const kdfParams = createKdfParams()
    const unlockKey = await deriveUnlockKey(input.newPassword, input.secretKey, kdfParams)
    const vaultId = input.cryptoConfig.wrappedVaultKey.aad.vaultId || input.userId

    try {
      return {
        keyId: input.cryptoConfig.keyId,
        kdfParams,
        wrappedVaultKey: await encryptEnvelope(
          unlockKey,
          session.vaultKeyBytes,
          vaultKeyInfo(input.userId, vaultId, input.cryptoConfig.keyId, kdfParams),
          input.cryptoConfig.keyId
        )
      }
    } finally {
      unlockKey.fill(0)
    }
  }

  async createDeviceFastUnlock(
    input: CreateDeviceFastUnlockInput
  ): Promise<{ fastUnlock: DeviceFastUnlock; deviceUnlockKey: string }> {
    const session = this.sessions.requireUnlocked(input.sessionId, input.keyId)
    if (session.userId !== input.userId) throw new Error('Vault session user does not match')

    const deviceKeyId = `device-key-${crypto.randomUUID()}`
    const deviceUnlockKeyBytes = randomBytes(KEY_BYTES)
    const deviceUnlockKey = bytesToBase64url(deviceUnlockKeyBytes)
    const now = input.now ?? new Date().toISOString()
    const additionalInfo = deviceFastUnlockInfo({ ...input, deviceKeyId })

    try {
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
          deviceWrappedVaultKey: await encryptEnvelope(
            deviceUnlockKeyBytes,
            session.vaultKeyBytes,
            additionalInfo,
            deviceKeyId
          )
        },
        deviceUnlockKey
      }
    } finally {
      deviceUnlockKeyBytes.fill(0)
    }
  }

  async unlockWithDeviceKey(input: DeviceUnlockInput): Promise<{ sessionId: string }> {
    const fastUnlock = input.cryptoConfig.fastUnlock
    if (!fastUnlock || fastUnlock.version !== 1) throw new Error('Trusted device fast unlock is not configured')
    if (
      fastUnlock.userId !== input.userId ||
      fastUnlock.deviceId !== input.deviceId ||
      fastUnlock.keyId !== input.cryptoConfig.keyId
    ) {
      throw new Error('Trusted device fast unlock metadata does not match')
    }

    const deviceUnlockKey = decodeDeviceUnlockKey(input.deviceUnlockKey)
    let vaultKey: Uint8Array
    try {
      vaultKey = await decryptEnvelope(
        deviceUnlockKey,
        fastUnlock.deviceWrappedVaultKey,
        deviceFastUnlockInfo(fastUnlock),
        fastUnlock.deviceKeyId
      )
    } finally {
      deviceUnlockKey.fill(0)
    }

    try {
      return { sessionId: await this.sessions.open(input.userId, input.cryptoConfig.keyId, vaultKey) }
    } finally {
      vaultKey.fill(0)
    }
  }

  async encryptAttachment(
    sessionId: string,
    keyId: string,
    attachmentId: string,
    plaintext: Uint8Array
  ): Promise<EncryptedAttachmentBlob> {
    const session = this.sessions.requireUnlocked(sessionId, keyId)
    return encryptEnvelope(session.vaultKey, plaintext, attachmentInfo(attachmentId, keyId), keyId)
  }

  async decryptAttachment(
    sessionId: string,
    keyId: string,
    attachmentId: string,
    envelope: EncryptedAttachmentBlob
  ): Promise<Uint8Array> {
    const session = this.sessions.requireUnlocked(sessionId, keyId)
    return decryptEnvelope(session.vaultKey, envelope, attachmentInfo(attachmentId, keyId), keyId)
  }

  async encryptObject(
    sessionId: string,
    keyId: string,
    metadata: VaultObjectMetadata,
    payload: unknown
  ): Promise<EncryptedSyncObjectPayload> {
    const session = this.sessions.requireUnlocked(sessionId, keyId)
    const plaintext = utf8ToBytes(stableStringify(payload))
    try {
      return await encryptEnvelope(session.vaultKey, plaintext, objectInfo(metadata, keyId), keyId)
    } finally {
      plaintext.fill(0)
    }
  }

  async decryptObject<T>(
    sessionId: string,
    keyId: string,
    metadata: VaultObjectMetadata,
    envelope: EncryptedSyncObjectPayload
  ): Promise<T> {
    const session = this.sessions.requireUnlocked(sessionId, keyId)
    const plaintext = await decryptEnvelope(session.vaultKey, envelope, objectInfo(metadata, keyId), keyId)
    try {
      return JSON.parse(bytesToUtf8(plaintext)) as T
    } finally {
      plaintext.fill(0)
    }
  }

  async softLock(sessionId: string): Promise<void> {
    await this.sessions.softLock(sessionId)
  }

  async resume(sessionId: string, password: string): Promise<boolean> {
    return this.sessions.resume(sessionId, password)
  }

  async closeSession(sessionId: string): Promise<void> {
    await this.sessions.close(sessionId)
  }

  async closeAllSessions(): Promise<void> {
    await this.sessions.closeAll()
  }

  private async decryptVaultKey(input: {
    userId: string
    password: string
    secretKey: string
    cryptoConfig: UserCryptoConfig
  }): Promise<Uint8Array> {
    const unlockKey = await deriveUnlockKey(input.password, input.secretKey, input.cryptoConfig.kdfParams)
    const vaultId = input.cryptoConfig.wrappedVaultKey.aad.vaultId || input.userId
    try {
      return await decryptEnvelope(
        unlockKey,
        input.cryptoConfig.wrappedVaultKey,
        vaultKeyInfo(input.userId, vaultId, input.cryptoConfig.keyId, input.cryptoConfig.kdfParams),
        input.cryptoConfig.keyId
      )
    } finally {
      unlockKey.fill(0)
    }
  }
}

function decodeDeviceUnlockKey(value: string): Uint8Array {
  const bytes = base64urlToBytes(value)
  if (bytes.byteLength !== KEY_BYTES) throw new Error('deviceUnlockKey must be 32 bytes')
  return bytes
}

export function serializeEnvelope(envelope: CryptoEnvelope): Uint8Array {
  return utf8ToBytes(stableStringify(envelope))
}

export function parseAttachmentEnvelope(bytes: Uint8Array): EncryptedAttachmentBlob {
  return JSON.parse(bytesToUtf8(bytes)) as EncryptedAttachmentBlob
}
