export interface AccountView {
  id: string
  displayName: string
  email?: string | null
  disabledAt?: string | null
  createdAt: string
  updatedAt: string
  roles: string[]
}

export interface DeviceView {
  id: string
  accountId: string
  clientDeviceId?: string | null
  name: string
  remark?: string | null
  tokenScopes?: string[]
  lastSeenAt?: string | null
  lastSeenIp?: string | null
  revokedAt?: string | null
  createdAt: string
}

export interface IdentityView {
  id: string
  provider: string
  providerSubject: string
  displayLabel: string
  createdAt: string
}

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface UsageResponse {
  devices: number
  syncObjects: number
  syncEvents: number
  storageBytes: number
}

export interface AuthResponse {
  account: AccountView
  token: string
  tokenType: string
}

export type EmailChallengePurpose = 'register' | 'login'

export interface EmailStartResponse {
  challengeId: string
  email: string
  expiresAt: string
  resendAfterSeconds: number
}

export interface EmailVerifyResponse {
  accountSetupToken: string
  email: string
  displayName?: string | null
  purpose: EmailChallengePurpose
  expiresAt: string
}

export interface MeResponse {
  account: AccountView
  device?: DeviceView | null
  roles: string[]
}

export interface HealthResponse {
  status: string
  version: string
  storage: string
  database: string
  startedAt: string
}

export interface InstanceConfig {
  registrationEnabled: boolean
  smsEnabled: boolean
  googleEnabled: boolean
  wechatEnabled: boolean
  email: EmailServiceConfig
  officialHosted: boolean
  maxDevicesPerAccount: number
  maxStorageBytes: number
}

export type EmailServiceMode = 'log' | 'smtp'

export interface EmailServiceConfig {
  mode: EmailServiceMode
  from: string
  smtpHost?: string | null
  smtpPort: number
  smtpUsername?: string | null
  smtpPassword?: string
  smtpPasswordSet: boolean
}

export type EmailServicePatch = Partial<Pick<
  EmailServiceConfig,
  'mode' | 'from' | 'smtpHost' | 'smtpPort' | 'smtpUsername' | 'smtpPassword'
>>

export type InstanceConfigPatch = Partial<Omit<InstanceConfig, 'email'>> & {
  email?: EmailServicePatch
}

export interface EmailTemplateSummary {
  id: string
  event: string
  locale: string
  name: string
  subject: string
  isCustom: boolean
  updatedAt?: string | null
}

export interface EmailTemplateDetail extends EmailTemplateSummary {
  html: string
  placeholders: string[]
}

export interface EmailTemplateListResponse {
  templates: EmailTemplateSummary[]
}

export interface EmailTemplatePreviewResponse {
  subject: string
  html: string
}

export interface AuditLogView {
  id: number
  actorAccountId?: string | null
  action: string
  targetType: string
  targetId?: string | null
  metadata: unknown
  createdAt: string
}

export interface RoleView {
  code: string
  name: string
  builtIn?: boolean
  permissions: string[]
}

export interface PermissionView {
  code: string
  description: string
}

export interface AdminRolesResponse {
  roles: RoleView[]
  permissions: PermissionView[]
}

export interface AdminSyncDataCounts {
  syncSpaces: number
  syncObjects: number
  syncEvents: number
  wrappedVaultKeys: number
  deviceSyncCursors: number
  syncIdempotencyKeys: number
}

export interface AdminSyncSpaceView {
  id: string
  accountId: string
  accountName: string
  displayName: string
  encryptedMetadataBytes: number
  objectCount: number
  activeWrappedVaultKeyCount: number
  createdAt: string
  updatedAt: string
}

export interface AdminSyncObjectView {
  id: string
  accountId: string
  accountName: string
  syncSpaceId: string
  syncSpaceName: string
  vaultId: string
  objectType: string
  revision: number
  payloadBytes: number
  updatedByDeviceId: string
  updatedByDeviceName?: string | null
  deletedAt?: string | null
  updatedAt: string
}

export interface AdminSyncObjectSummaryView {
  accountId: string
  accountName: string
  syncSpaceId: string
  syncSpaceName: string
  objectType: string
  objectCount: number
  activeCount: number
  deletedCount: number
  payloadBytes: number
  maxRevision: number
  latestUpdatedAt?: string | null
}

export interface AdminSyncEventView {
  id: number
  accountId: string
  accountName: string
  syncSpaceId: string
  syncSpaceName: string
  objectId: string
  objectRevision: number
  baseRevision: number
  eventType: string
  snapshotBytes: number
  createdAt: string
}

export interface AdminSyncEventSummaryView {
  syncedAt: string
  accountId: string
  accountName: string
  syncSpaceId: string
  syncSpaceName: string
  eventCount: number
  createdCount: number
  updatedCount: number
  deletedCount: number
  snapshotBytes: number
  firstEventId: number
  lastEventId: number
}

export interface AdminWrappedVaultKeyView {
  id: string
  accountId: string
  accountName: string
  syncSpaceId: string
  syncSpaceName: string
  vaultId: string
  keyId: string
  wrapType: string
  generation: number
  kdfParamsBytes: number
  wrappedVaultKeyBytes: number
  createdByDeviceId?: string | null
  createdByDeviceName?: string | null
  createdAt: string
  revokedAt?: string | null
}

export interface AdminDeviceSyncCursorView {
  accountId: string
  accountName: string
  deviceId: string
  deviceName: string
  cursor: number
  ackedAt: string
}

export interface AdminSyncIdempotencyKeyView {
  accountId: string
  accountName: string
  deviceId: string
  deviceName: string
  clientBatchId: string
  clientOperationId: string
  responseBytes: number
  createdAt: string
}

export interface AdminSyncDataResponse {
  counts: AdminSyncDataCounts
  syncSpaces: AdminSyncSpaceView[]
  syncObjectSummaries: AdminSyncObjectSummaryView[]
  syncObjects: AdminSyncObjectView[]
  syncEventSummaries: AdminSyncEventSummaryView[]
  syncEvents: AdminSyncEventView[]
  wrappedVaultKeys: AdminWrappedVaultKeyView[]
  deviceSyncCursors: AdminDeviceSyncCursorView[]
  syncIdempotencyKeys: AdminSyncIdempotencyKeyView[]
}

export interface SyncSpaceView {
  id: string
  accountId?: string
  displayName?: string
  encryptedMetadata?: JsonValue
  createdAt: string
  updatedAt?: string
  deletedAt?: string | null
}

export interface SyncSpacesResponse {
  syncSpaces: SyncSpaceView[]
}

export interface SyncSpaceCreateRequest {
  displayName?: string
  encryptedMetadata?: JsonValue
}

export interface KdfParams {
  version: number
  name: string
  memoryKiB?: number
  iterations?: number
  parallelism?: number
  salt?: string
  keyLengthBytes?: number
  purpose?: string
  [key: string]: JsonValue | undefined
}

export interface EncryptedEnvelope {
  version?: number
  alg?: string
  keyId?: string
  nonce?: string
  aad?: JsonValue
  ciphertext?: string
  tag?: string
  [key: string]: JsonValue | undefined
}

export interface WrappedVaultKeyRecord {
  id: string
  syncSpaceId?: string
  vaultId: string
  keyId: string
  wrapType: 'user_wrapped' | string
  generation: number
  kdfParams?: KdfParams | JsonValue
  wrappedVaultKey?: EncryptedEnvelope | JsonValue
  createdAt?: string
  revokedAt?: string | null
}

export interface WrappedVaultKeysResponse {
  wrappedVaultKeys: WrappedVaultKeyRecord[]
}

export interface WrappedVaultKeyCreateRequest {
  syncSpaceId: string
  vaultId: string
  keyId: string
  wrapType: 'user_wrapped'
  replacesWrappedVaultKeyId?: string | null
  kdfParams: KdfParams | JsonValue
  wrappedVaultKey: EncryptedEnvelope | JsonValue
}

export interface WrappedVaultKeyCreateResponse {
  wrappedVaultKeyRecord: WrappedVaultKeyRecord
}

export interface SyncObjectView {
  syncSpaceId?: string
  objectId: string
  vaultId: string
  objectType: string
  revision: number
  baseRevision?: number
  encryptedPayload: EncryptedEnvelope | JsonValue
  updatedByDeviceId?: string
  deletedAt?: string | null
  updatedAt?: string
}

export interface SyncSnapshotResponse {
  syncSpaceId: string
  snapshotCursor: number
  generatedAt: string
  wrappedVaultKeys: WrappedVaultKeyRecord[]
  objects: SyncObjectView[]
  includesTombstones: boolean
  nextPageToken?: string | null
}

export interface SyncPushObject {
  clientOperationId?: string
  syncSpaceId?: string
  objectId: string
  vaultId: string
  objectType: string
  baseRevision: number
  revision?: number
  encryptedPayload: EncryptedEnvelope | JsonValue
  deletedAt?: string | null
}

export interface SyncPushAccepted {
  clientOperationId?: string
  objectId: string
  revision: number
  eventId?: number
}

export interface SyncConflict {
  clientOperationId?: string
  objectId: string
  expectedRevision: number
  currentRevision: number
  serverObject?: SyncObjectView | null
}

export interface SyncRejected {
  clientOperationId?: string
  objectId?: string
  code: string
  message: string
}

export interface SyncPushResponse {
  accepted: SyncPushAccepted[]
  conflicts: SyncConflict[]
  rejected?: SyncRejected[]
  nextCursor: number
}

export interface SyncEventView {
  id: number
  syncSpaceId?: string
  eventType: string
  objectId?: string
  objectRevision?: number
  object?: SyncObjectView
  objectSnapshot?: SyncObjectView | JsonValue
  createdAt?: string
}

export interface SyncPullResponse {
  cursor: number
  nextCursor: number
  hasMore?: boolean
  events: SyncEventView[]
}

export interface SyncAckResponse {
  ok: boolean
}
