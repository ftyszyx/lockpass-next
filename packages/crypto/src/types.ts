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

export interface CryptoEnvelope<AdditionalInfo extends Record<string, unknown> = Record<string, unknown>> {
  version: 1
  alg: 'AES-256-GCM'
  keyId: string
  nonce: string
  aad: AdditionalInfo
  ciphertext: string
  tag: string
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

export interface VaultObjectMetadata {
  objectType: SyncVaultObjectType
  objectId: string
  vaultId: string
  revision: number
}

export type EncryptedSyncObjectPayload = CryptoEnvelope<{
  purpose: 'encrypt-vault-object-v1'
  objectType: SyncVaultObjectType
  objectId: string
  vaultId: string
  schemaVersion: number
  keyId: string
  revision: number
}>

export interface UserCryptoConfig {
  keyId: string
  kdfParams: KdfParams
  wrappedVaultKey: WrappedVaultKey
  fastUnlock?: DeviceFastUnlock | null
}

export interface VaultCryptoSession {
  sessionId: string
}

export interface CreateUserInput {
  userId: string
  password: string
  secretKey: string
  vaultId: string
}

export interface UnlockUserInput {
  userId: string
  password: string
  secretKey: string
  cryptoConfig: UserCryptoConfig
}

export interface ChangeUserPasswordInput extends UnlockUserInput {
  sessionId: string
  newPassword: string
}

export interface CreateDeviceFastUnlockInput {
  accountId: string
  userId: string
  deviceId: string
  vaultId: string
  keyId: string
  sessionId: string
  now?: string
}

export interface DeviceUnlockInput {
  userId: string
  deviceId: string
  deviceUnlockKey: string
  cryptoConfig: UserCryptoConfig
}

export interface VaultCryptoProvider {
  createUser(input: CreateUserInput): Promise<{ crypto: UserCryptoConfig; sessionId: string }>
  unlockUser(input: UnlockUserInput): Promise<VaultCryptoSession>
  verifyCredentials(input: UnlockUserInput): Promise<boolean>
  changeUserPassword(input: ChangeUserPasswordInput): Promise<UserCryptoConfig>
  createDeviceFastUnlock(
    input: CreateDeviceFastUnlockInput
  ): Promise<{ fastUnlock: DeviceFastUnlock; deviceUnlockKey: string }>
  unlockWithDeviceKey(input: DeviceUnlockInput): Promise<VaultCryptoSession>
  encryptAttachment(
    sessionId: string,
    keyId: string,
    attachmentId: string,
    plaintext: Uint8Array
  ): Promise<EncryptedAttachmentBlob>
  decryptAttachment(
    sessionId: string,
    keyId: string,
    attachmentId: string,
    envelope: EncryptedAttachmentBlob
  ): Promise<Uint8Array>
  encryptObject(
    sessionId: string,
    keyId: string,
    metadata: VaultObjectMetadata,
    payload: unknown
  ): Promise<EncryptedSyncObjectPayload>
  decryptObject<T>(
    sessionId: string,
    keyId: string,
    metadata: VaultObjectMetadata,
    envelope: EncryptedSyncObjectPayload
  ): Promise<T>
  softLock(sessionId: string): Promise<void>
  resume(sessionId: string, password: string): Promise<boolean>
  closeSession(sessionId: string): Promise<void>
  closeAllSessions(): Promise<void>
}
