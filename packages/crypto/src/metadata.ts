import type {
  DeviceFastUnlock,
  EncryptedAttachmentBlob,
  EncryptedSyncObjectPayload,
  KdfParams,
  VaultObjectMetadata,
  WrappedVaultKey
} from './types.js'

const WRAP_SCHEMA_VERSION = 1
const DEVICE_WRAP_SCHEMA_VERSION = 1
const LOCAL_PAYLOAD_SCHEMA_VERSION = 2

export function vaultKeyInfo(
  userId: string,
  vaultId: string,
  keyId: string,
  kdfParams: KdfParams
): WrappedVaultKey['aad'] {
  return {
    purpose: 'wrap-vault-key-v1',
    userId,
    vaultId,
    keyId,
    kdfVersion: kdfParams.version,
    schemaVersion: WRAP_SCHEMA_VERSION
  }
}

export function deviceFastUnlockInfo(input: {
  accountId: string
  userId: string
  deviceId: string
  vaultId: string
  keyId: string
  deviceKeyId: string
}): DeviceFastUnlock['deviceWrappedVaultKey']['aad'] {
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

export function objectInfo(metadata: VaultObjectMetadata, keyId: string): EncryptedSyncObjectPayload['aad'] {
  return {
    purpose: 'encrypt-vault-object-v1',
    objectType: metadata.objectType,
    objectId: metadata.objectId,
    vaultId: metadata.vaultId,
    schemaVersion: 1,
    keyId,
    revision: metadata.revision
  }
}

export function attachmentInfo(attachmentId: string, keyId: string): EncryptedAttachmentBlob['aad'] {
  return {
    purpose: 'encrypt-attachment-blob-v1',
    objectType: 'attachment_blob',
    objectId: attachmentId,
    schemaVersion: LOCAL_PAYLOAD_SCHEMA_VERSION,
    keyId
  }
}
