import type { Vault, VaultAttachment, VaultItem } from '@lockpass/core'
import {
  WebVaultCryptoProvider,
  generateSecretKey,
  parseAttachmentEnvelope,
  requireServerUuidFromLocalId,
  serializeEnvelope,
  serverUuidFromLocalId,
  type CryptoEnvelope,
  type EncryptedAttachmentBlob,
  type EncryptedSyncObjectPayload,
  type KdfParams,
  type SyncVaultObjectType,
  type UserCryptoConfig,
  type VaultCryptoSession,
  type WrappedVaultKey
} from '@lockpass/crypto'
import type { PerfTrace } from '@/services/perfTrace'

export type {
  CryptoEnvelope,
  EncryptedAttachmentBlob,
  EncryptedSyncObjectPayload,
  KdfParams,
  SyncVaultObjectType,
  VaultCryptoSession,
  WrappedVaultKey
}

export type DesktopUserCrypto = UserCryptoConfig

export interface DesktopVaultPayload {
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
}

const cryptoProvider = new WebVaultCryptoProvider()

export { generateSecretKey, requireServerUuidFromLocalId, serverUuidFromLocalId }

export async function createUserCrypto(
  userId: string,
  password: string,
  payload?: DesktopVaultPayload,
  secretKey = generateSecretKey()
): Promise<{ crypto: DesktopUserCrypto; secretKey: string; sessionId: string }> {
  const localVaultId = payload?.vaults.find((vault) => !vault.sync.deletedAt)?.id
  const vaultId = localVaultId ? serverUuidFromLocalId(localVaultId) ?? crypto.randomUUID() : crypto.randomUUID()
  const created = await cryptoProvider.createUser({ userId, password, secretKey, vaultId })
  return { ...created, secretKey }
}

export async function unlockUserCrypto(
  userId: string,
  password: string,
  secretKey: string,
  cryptoConfig: DesktopUserCrypto,
  perf?: PerfTrace
): Promise<VaultCryptoSession & { payload: DesktopVaultPayload }> {
  const unlocked = await perfMeasure(perf, 'crypto.unlock.web', () =>
    cryptoProvider.unlockUser({ userId, password, secretKey, cryptoConfig })
  )
  return { ...unlocked, payload: emptyDesktopVaultPayload() }
}

export async function verifyUserCryptoCredentials(
  userId: string,
  password: string,
  secretKey: string,
  cryptoConfig: DesktopUserCrypto
): Promise<boolean> {
  return cryptoProvider.verifyCredentials({ userId, password, secretKey, cryptoConfig })
}

export async function encryptAttachmentBytes(
  sessionId: string,
  keyId: string,
  attachmentId: string,
  bytes: Uint8Array
): Promise<EncryptedAttachmentBlob> {
  return cryptoProvider.encryptAttachment(sessionId, keyId, attachmentId, bytes)
}

export async function decryptAttachmentBytes(
  sessionId: string,
  keyId: string,
  attachmentId: string,
  envelope: EncryptedAttachmentBlob
): Promise<Uint8Array> {
  return cryptoProvider.decryptAttachment(sessionId, keyId, attachmentId, envelope)
}

export async function encryptSyncObjectPayload(
  sessionId: string,
  keyId: string,
  metadata: {
    objectType: SyncVaultObjectType
    objectId: string
    vaultId: string
    revision: number
  },
  payload: unknown
): Promise<EncryptedSyncObjectPayload> {
  return cryptoProvider.encryptObject(sessionId, keyId, metadata, payload)
}

export async function decryptSyncObjectPayload<T>(
  sessionId: string,
  keyId: string,
  metadata: {
    objectType: SyncVaultObjectType
    objectId: string
    vaultId: string
    revision: number
  },
  envelope: EncryptedSyncObjectPayload
): Promise<T> {
  return cryptoProvider.decryptObject<T>(sessionId, keyId, metadata, envelope)
}

export async function closeVaultSession(sessionId: string): Promise<void> {
  await cryptoProvider.closeSession(sessionId)
}

export async function closeAllVaultSessions(): Promise<void> {
  await cryptoProvider.closeAllSessions()
}

export { parseAttachmentEnvelope, serializeEnvelope }

function emptyDesktopVaultPayload(): DesktopVaultPayload {
  return { vaults: [], items: [], attachments: [] }
}

async function perfMeasure<T>(perf: PerfTrace | undefined, name: string, operation: () => Promise<T>): Promise<T> {
  return perf ? perf.measure(name, operation) : operation()
}
