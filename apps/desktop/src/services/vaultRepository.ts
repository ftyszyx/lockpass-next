import { invoke } from '@tauri-apps/api/core'
import type { SupportedLocale } from '@/i18n'
import type { SyncMode } from '@/services/syncClient'
import {
  decryptAttachmentBytes,
  encryptAttachmentBytes,
  parseAttachmentEnvelope,
  serializeEnvelope,
  type DesktopUserCrypto,
  type EncryptedSyncObjectPayload,
  type SyncVaultObjectType
} from '@/services/masterPassword'

export interface DesktopLayoutSettings {
  sidebarWidth: number
  itemListWidth: number
}

export type DesktopLogLevel = 'off' | 'error' | 'info' | 'debug'

export interface DesktopLoggingSettings {
  level: DesktopLogLevel
}

export type ShortcutScope = 'global' | 'internal'
export type GlobalShortcutAction = 'quickSearch' | 'lock' | 'showMainWindow' | 'hideMainWindow'
export type InternalShortcutAction = 'quickSearch' | 'newItem' | 'lock' | 'passwordGenerator' | 'settings' | 'syncNow'
export type ShortcutAction = GlobalShortcutAction | InternalShortcutAction

export interface DesktopShortcutSettings {
  global: Record<GlobalShortcutAction, string>
  internal: Record<InternalShortcutAction, string>
}

export interface DesktopSecuritySettings {
  startOnLogin: boolean
  autoLockOnLimit: boolean
  autoLockDelaySeconds: number
}

export interface DesktopSyncSettings {
  mode: SyncMode
  serverUrl: string
  syncSpaceId: string | null
  accountId: string | null
  accountLabel: string | null
  deviceId: string | null
  cursor: number
  connectedAt: string | null
  lastSyncAt: string | null
}

export interface DesktopUserProfile {
  id: string
  username: string
  displayName: string
  createdAt: string
  updatedAt: string
  sync?: DesktopSyncSettings | null
  crypto: DesktopUserCrypto | null
}

export interface DesktopVaultStoreData {
  schemaVersion: 2
  activeUserId: string | null
  users: DesktopUserProfile[]
  settings: {
    locale: SupportedLocale
    deviceId: string
    layout: DesktopLayoutSettings
    logging: DesktopLoggingSettings
    shortcuts: DesktopShortcutSettings
    security: DesktopSecuritySettings
    sync: DesktopSyncSettings
  }
}

export type StorageBackend = 'tauri' | 'browser'
export type SecureSecretKeyResult =
  | { status: 'saved' }
  | { status: 'loaded'; secretKey: string }
  | { status: 'missing' }
  | { status: 'deleted' }
  | { status: 'unsupported' }

export type SecureDeviceUnlockKeyResult =
  | { status: 'deleted' }
  | { status: 'unsupported' }

export interface LoadedVaultStore {
  data: DesktopVaultStoreData | null
  backend: StorageBackend
}

export interface UploadedAttachment {
  encryptedBlobRef: string
  checksumSha256: string
}

export interface EncryptedObjectRecord {
  objectId: string
  objectType: SyncVaultObjectType
  vaultId: string
  revision: number
  baseRevision: number
  syncState: 'clean' | 'dirty' | 'pending' | 'conflicted'
  deletedAt: string | null
  updatedAt: string
  keyId: string
  envelope: EncryptedSyncObjectPayload
}

export interface EncryptedObjectQuery {
  objectType?: SyncVaultObjectType
  vaultId?: string
}

export interface VaultObjectCount {
  vaultId: string
  count: number
}

export interface AttachmentLoadInput {
  id: string
  mimeType: string
  encryptedBlobRef: string
  previewFile?: File
}

const BROWSER_STORAGE_KEY = 'lockpass-next:vault-store'
const BROWSER_SYNC_TOKEN_PREFIX = `${BROWSER_STORAGE_KEY}:sync-token:`
const attachmentBlobCache = new Map<string, Blob>()

export function clearAttachmentBlobCache(): void {
  attachmentBlobCache.clear()
}

export async function loadVaultStore(): Promise<LoadedVaultStore> {
  if (isTauriRuntime()) {
    const data = await invoke<DesktopVaultStoreData | null>('load_vault_store')
    return { data, backend: 'tauri' }
  }

  const raw = window.localStorage.getItem(BROWSER_STORAGE_KEY)
  return { data: raw ? (JSON.parse(raw) as DesktopVaultStoreData) : null, backend: 'browser' }
}

export async function saveVaultStore(data: DesktopVaultStoreData): Promise<void> {
  assertNoForbiddenLocalStoreField(data)

  if (isTauriRuntime()) {
    await invoke('save_vault_store', { data })
    return
  }

  window.localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(data))
}

export async function loadEncryptedObjects(userId: string): Promise<EncryptedObjectRecord[]> {
  if (isTauriRuntime()) {
    return invoke<EncryptedObjectRecord[]>('load_encrypted_objects', { userId })
  }

  const raw = window.localStorage.getItem(browserEncryptedObjectsStorageKey(userId))
  return raw ? (JSON.parse(raw) as EncryptedObjectRecord[]) : []
}

export async function queryEncryptedObjects(userId: string, query: EncryptedObjectQuery): Promise<EncryptedObjectRecord[]> {
  if (isTauriRuntime()) {
    return invoke<EncryptedObjectRecord[]>('query_encrypted_objects', { userId, query })
  }

  const records = await loadEncryptedObjects(userId)
  return records.filter((record) =>
    (!query.objectType || record.objectType === query.objectType) &&
    (!query.vaultId || record.vaultId === query.vaultId)
  )
}

export async function countEncryptedObjectsByVault(userId: string, objectType: SyncVaultObjectType): Promise<VaultObjectCount[]> {
  if (isTauriRuntime()) {
    return invoke<VaultObjectCount[]>('count_encrypted_objects_by_vault', { userId, objectType })
  }

  const counts = new Map<string, number>()
  for (const record of await loadEncryptedObjects(userId)) {
    if (record.objectType !== objectType || record.deletedAt) continue
    counts.set(record.vaultId, (counts.get(record.vaultId) ?? 0) + 1)
  }
  return [...counts.entries()].map(([vaultId, count]) => ({ vaultId, count }))
}

export async function saveEncryptedObjects(userId: string, records: EncryptedObjectRecord[]): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('save_encrypted_objects', { userId, records })
    return
  }

  window.localStorage.setItem(browserEncryptedObjectsStorageKey(userId), JSON.stringify(records))
}

export async function upsertEncryptedObjects(userId: string, records: EncryptedObjectRecord[]): Promise<void> {
  if (records.length === 0) return

  if (isTauriRuntime()) {
    await invoke('upsert_encrypted_objects', { userId, records })
    return
  }

  const existing = await loadEncryptedObjects(userId)
  const nextById = new Map(existing.map((record) => [record.objectId, record]))
  for (const record of records) {
    nextById.set(record.objectId, record)
  }
  window.localStorage.setItem(browserEncryptedObjectsStorageKey(userId), JSON.stringify([...nextById.values()]))
}

export async function openExternalUrl(url: string): Promise<void> {
  if (!isTauriRuntime()) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer')
    if (!opened) {
      window.location.assign(url)
    }
    return
  }

  await invoke('open_external_url', { url })
}

export async function openAppDataDir(): Promise<string | null> {
  if (!isTauriRuntime()) return null
  return invoke<string>('open_app_data_dir')
}

export async function getAppDataDir(): Promise<string | null> {
  if (!isTauriRuntime()) return null
  return invoke<string>('get_app_data_dir')
}

export async function loadStartOnLogin(): Promise<boolean | null> {
  if (!isTauriRuntime()) return null
  return invoke<boolean | null>('load_start_on_login')
}

export async function setStartOnLogin(enabled: boolean): Promise<boolean | null> {
  if (!isTauriRuntime()) return null
  return invoke<boolean | null>('set_start_on_login', { enabled })
}

export async function saveSecretKey(userId: string, secretKey: string): Promise<SecureSecretKeyResult> {
  if (!isTauriRuntime()) return { status: 'unsupported' }

  await invoke('save_secret_key', { userId, secretKey })
  return { status: 'saved' }
}

export async function loadSecretKey(userId: string): Promise<SecureSecretKeyResult> {
  if (!isTauriRuntime()) return { status: 'unsupported' }

  const secretKey = await invoke<string | null>('load_secret_key', { userId })
  return secretKey ? { status: 'loaded', secretKey } : { status: 'missing' }
}

export async function deleteSecretKey(userId: string): Promise<SecureSecretKeyResult> {
  if (!isTauriRuntime()) return { status: 'unsupported' }

  await invoke('delete_secret_key', { userId })
  return { status: 'deleted' }
}

export async function deleteDeviceUnlockKey(
  accountId: string,
  userId: string,
  deviceId: string,
  deviceKeyId: string
): Promise<SecureDeviceUnlockKeyResult> {
  if (!isTauriRuntime()) return { status: 'unsupported' }

  await invoke('delete_device_unlock_key', { accountId, userId, deviceId, deviceKeyId })
  return { status: 'deleted' }
}

export async function saveSyncDeviceToken(userId: string, token: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('save_sync_device_token', { userId, token })
    return
  }

  window.localStorage.setItem(syncDeviceTokenStorageKey(userId), token)
}

export async function loadSyncDeviceToken(userId: string): Promise<string | null> {
  if (isTauriRuntime()) {
    return invoke<string | null>('load_sync_device_token', { userId })
  }

  return window.localStorage.getItem(syncDeviceTokenStorageKey(userId))
}

export async function deleteSyncDeviceToken(userId: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('delete_sync_device_token', { userId })
    return
  }

  window.localStorage.removeItem(syncDeviceTokenStorageKey(userId))
}

export async function saveAttachmentFile(
  userId: string,
  attachmentId: string,
  file: File,
  sessionId: string,
  keyId: string
): Promise<UploadedAttachment> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const checksumSha256 = await sha256Hex(bytes)
  const encryptedBytes = await encryptAttachmentBlobBytes(attachmentId, bytes, sessionId, keyId)
  attachmentBlobCache.set(attachmentId, file)

  const encryptedBlobRef = await writeAttachmentBlob(userId, attachmentId, `${attachmentId}.lpblob`, encryptedBytes)
  return { encryptedBlobRef, checksumSha256 }
}

export async function migrateLegacyAttachmentBlob(
  userId: string,
  attachmentId: string,
  fileName: string,
  legacyBlobRef: string,
  sessionId: string,
  keyId: string
): Promise<UploadedAttachment> {
  const bytes = await loadRawAttachmentBlob(attachmentId, legacyBlobRef)
  const checksumSha256 = await sha256Hex(bytes)
  const encryptedBytes = await encryptAttachmentBlobBytes(attachmentId, bytes, sessionId, keyId)
  const encryptedBlobRef = await writeAttachmentBlob(userId, attachmentId, `${attachmentId}.lpblob`, encryptedBytes)
  return { encryptedBlobRef, checksumSha256 }
}

export async function loadAttachmentBlobBytes(attachmentId: string, encryptedBlobRef: string): Promise<Uint8Array> {
  return loadRawAttachmentBlob(attachmentId, encryptedBlobRef)
}

export async function saveEncryptedAttachmentBlob(
  userId: string,
  attachmentId: string,
  fileName: string,
  bytes: Uint8Array
): Promise<string> {
  return writeAttachmentBlob(userId, attachmentId, fileName, bytes)
}

async function writeAttachmentBlob(userId: string, attachmentId: string, fileName: string, bytes: Uint8Array): Promise<string> {
  if (isTauriRuntime()) {
    return invoke<string>('save_attachment_blob', {
      userId,
      attachmentId,
      fileName,
      bytes: Array.from(bytes)
    })
  }

  const storageKey = `${BROWSER_STORAGE_KEY}:attachment:${userId}:${attachmentId}`
  window.localStorage.setItem(storageKey, uint8ToBase64(bytes))
  return `browser://users/${userId}/attachments/${attachmentId}`
}

export async function loadAttachmentFile(attachment: AttachmentLoadInput, sessionId: string, keyId: string): Promise<Blob> {
  if (attachment.previewFile) return attachment.previewFile

  const cached = attachmentBlobCache.get(attachment.id)
  if (cached) return cached

  let encryptedBytes: Uint8Array
  if (isTauriRuntime()) {
    const bytes = await invoke<number[]>('load_attachment_blob', {
      encryptedBlobRef: attachment.encryptedBlobRef
    })
    encryptedBytes = new Uint8Array(bytes)
  } else {
    const storageKey = browserAttachmentStorageKey(attachment.encryptedBlobRef, attachment.id)
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) throw new Error('Attachment file is not available')
    encryptedBytes = base64ToUint8(raw)
  }

  const decrypted = await decryptAttachmentBytes(sessionId, keyId, attachment.id, parseAttachmentEnvelope(encryptedBytes))
  const blob = new Blob([uint8ToArrayBuffer(decrypted)], { type: attachment.mimeType || 'application/octet-stream' })
  attachmentBlobCache.set(attachment.id, blob)
  return blob
}

async function loadRawAttachmentBlob(attachmentId: string, blobRef: string): Promise<Uint8Array> {
  if (isTauriRuntime()) {
    const bytes = await invoke<number[]>('load_attachment_blob', {
      encryptedBlobRef: blobRef
    })
    return new Uint8Array(bytes)
  }

  const storageKey = browserAttachmentStorageKey(blobRef, attachmentId)
  const raw = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(blobRef)
  if (!raw) throw new Error('Legacy attachment file is not available')
  return decodeStoredBytes(raw)
}

export async function deleteAttachmentBlobRef(blobRef: string, attachmentId: string): Promise<void> {
  if (isTauriRuntime()) {
    await invoke('delete_attachment_blob', { encryptedBlobRef: blobRef })
    return
  }

  window.localStorage.removeItem(browserAttachmentStorageKey(blobRef, attachmentId))
  window.localStorage.removeItem(blobRef)
}

async function encryptAttachmentBlobBytes(
  attachmentId: string,
  bytes: Uint8Array,
  sessionId: string,
  keyId: string
): Promise<Uint8Array> {
  const encryptedEnvelope = await encryptAttachmentBytes(sessionId, keyId, attachmentId, bytes)
  return serializeEnvelope(encryptedEnvelope)
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function assertNoForbiddenLocalStoreField(value: unknown): void {
  const field = findForbiddenLocalStoreField(value)
  if (field) {
    throw new Error(`vault store must not contain ${field}`)
  }
}

function findForbiddenLocalStoreField(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const child of value) {
      const field = findForbiddenLocalStoreField(child)
      if (field) return field
    }
    return null
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase()
    if (normalizedKey === 'secretkey') return 'secretKey plaintext'
    if (normalizedKey === 'deviceunlockkey') return 'deviceUnlockKey plaintext'
    if (normalizedKey === 'encryptedpayload') return 'legacy encryptedPayload blob'
    const field = findForbiddenLocalStoreField(child)
    if (field) return field
  }
  return null
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const digest = await crypto.subtle.digest('SHA-256', copy)
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return window.btoa(binary)
}

function base64ToUint8(value: string): Uint8Array {
  const binary = window.atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function decodeStoredBytes(value: string): Uint8Array {
  const payload = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value
  try {
    return base64ToUint8(payload)
  } catch {
    return new TextEncoder().encode(value)
  }
}

function browserAttachmentStorageKey(blobRef: string, attachmentId: string): string {
  if (blobRef.startsWith('browser://users/')) {
    const rest = blobRef.slice('browser://users/'.length)
    const [userId, attachmentPath] = rest.split('/attachments/')
    const browserAttachmentId = attachmentPath?.split('/')[0] || attachmentId
    if (userId && browserAttachmentId) {
      return `${BROWSER_STORAGE_KEY}:attachment:${userId}:${browserAttachmentId}`
    }
  }

  const browserAttachmentId = blobRef.startsWith('browser://attachments/')
    ? blobRef.slice('browser://attachments/'.length).split('/')[0] || attachmentId
    : attachmentId
  return `${BROWSER_STORAGE_KEY}:attachment:${browserAttachmentId}`
}

function syncDeviceTokenStorageKey(userId: string): string {
  return `${BROWSER_SYNC_TOKEN_PREFIX}${userId}`
}

function browserEncryptedObjectsStorageKey(userId: string): string {
  return `${BROWSER_STORAGE_KEY}:objects:${userId}`
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
