import type {
  VaultAttachment,
  VaultColor,
  VaultItemField,
  VaultItemType
} from '@lockpass/core'
import type { InitialServerVaultResult } from '@/services/accountBootstrap'
import type { DesktopUserProfile } from '@/services/vaultRepository'
import type { SyncDeviceBindCallbackPayload, SyncMode } from '@/services/syncClient'

export type SelectedType = 'all' | VaultItemType

export interface AttachmentDraft {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  encryptedBlobRef: string
  state: VaultAttachment['state']
  previewFile?: File
}

export interface SaveItemPayload {
  editingItemId: string | null
  type: VaultItemType
  vaultId: string
  title: string
  notes: string
  fields: VaultItemField[]
  attachments: AttachmentDraft[]
}

export interface CreateVaultPayload {
  name: string
  description: string
  color: VaultColor
  icon: string
}

export interface CreateUserPayload {
  username: string
  password: string
  secretKey?: string
  sync?: Pick<SyncConnectPayload, 'mode' | 'serverUrl'>
  serverAccount?: {
    serverUrl: string
    accountId: string
  }
}

export interface RestoreServerAccountPayload {
  exchange: PendingSyncDeviceBindExchange
  password: string
  secretKey: string
  requireSecretKeyStorage?: boolean
}

export interface CreateServerBackedUserPayload {
  exchange: PendingSyncDeviceBindExchange
  password: string
  secretKey: string
  initialVault: InitialServerVaultResult
}

export interface CreateUserResult {
  user: DesktopUserProfile
  secretKey: string
  secretKeyStorage: 'saved' | 'unsupported' | 'failed'
}

export interface SyncConnectPayload {
  mode: SyncMode
  serverUrl: string
}

export interface OfficialSyncAuthorization {
  loginUrl: string
}

export type PendingSyncDeviceBindExchange = SyncDeviceBindCallbackPayload

export interface SyncRunResult {
  pushed: number
  pulled: number
  conflicts: number
  rejected: number
  rejectedCodes: string[]
  cursor: number
  recoveredFromSnapshot?: boolean
}

export interface ImportItemsResult {
  imported: number
  skipped: number
  vaultName: string
}

export interface ImportVaultsResult {
  imported: number
  skipped: number
  vaults: number
  skippedVaults: number
}

export type SecretKeyStorageStatus = CreateUserResult['secretKeyStorage']
