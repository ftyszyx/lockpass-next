import type { SyncMetadata, Vault, VaultAttachment, VaultItem } from '@lockpass/core'
import {
  decryptSyncObjectPayload,
  encryptSyncObjectPayload,
  requireServerUuidFromLocalId,
  serverUuidFromLocalId,
  type DesktopVaultPayload,
  type EncryptedSyncObjectPayload,
  type SyncVaultObjectType
} from '@/services/masterPassword'
import type { SyncApiClient, SyncObjectView, SyncPushObject } from '@/services/syncClient'
import {
  queryEncryptedObjects,
  type DesktopSyncSettings,
  type EncryptedObjectRecord
} from '@/services/vaultRepository'

export interface SyncBuildInput {
  syncSpaceId: string
  sessionId: string
  keyId: string
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
}

type VaultObject = Vault | VaultItem | VaultAttachment

export async function buildSyncPushObjects(input: SyncBuildInput): Promise<SyncPushObject[]> {
  const objects: SyncPushObject[] = []

  for (const vault of input.vaults.filter((candidate) => shouldPushSync(candidate.sync))) {
    const objectId = toServerUuid(vault.id)
    const revision = vault.sync.revision
    const payload = withCleanSync(vault, revision)
    objects.push(await makeSyncPushObject(input, vault.sync, 'vault_metadata', objectId, objectId, payload))
  }

  for (const item of input.items.filter((candidate) => shouldPushSync(candidate.sync))) {
    const objectId = toServerUuid(item.id)
    const vaultId = toServerUuid(item.vaultId)
    const revision = item.sync.revision
    const payload = withCleanSync(item, revision)
    objects.push(await makeSyncPushObject(input, item.sync, 'vault_item', objectId, vaultId, payload))
  }

  for (const attachment of input.attachments.filter((candidate) => shouldPushSync(candidate.sync))) {
    const objectId = toServerUuid(attachment.id)
    const vaultId = toServerUuid(attachment.vaultId)
    const revision = attachment.sync.revision
    const payload = withCleanSync(attachment, revision)
    objects.push(await makeSyncPushObject(input, attachment.sync, 'vault_attachment', objectId, vaultId, payload))
  }

  return objects
}

export interface LocalObjectBuildInput {
  sessionId: string
  keyId: string
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
}

export async function buildLocalEncryptedObjectRecords(input: LocalObjectBuildInput): Promise<EncryptedObjectRecord[]> {
  const records: EncryptedObjectRecord[] = []

  for (const vault of input.vaults) {
    records.push(await makeLocalEncryptedObjectRecord(input, vault.sync, 'vault_metadata', vault.id, vault.id, vault))
  }

  for (const item of input.items) {
    records.push(await makeLocalEncryptedObjectRecord(input, item.sync, 'vault_item', item.id, item.vaultId, item))
  }

  for (const attachment of input.attachments) {
    records.push(await makeLocalEncryptedObjectRecord(input, attachment.sync, 'vault_attachment', attachment.id, attachment.vaultId, attachment))
  }

  return records
}

async function makeLocalEncryptedObjectRecord(
  input: LocalObjectBuildInput,
  sync: SyncMetadata,
  objectType: SyncVaultObjectType,
  objectId: string,
  vaultId: string,
  payload: VaultObject
): Promise<EncryptedObjectRecord> {
  return {
    objectId,
    objectType,
    vaultId,
    revision: sync.revision,
    baseRevision: sync.baseRevision,
    syncState: sync.state,
    deletedAt: sync.deletedAt,
    updatedAt: payload.updatedAt,
    keyId: input.keyId,
    envelope: await encryptSyncObjectPayload(
      input.sessionId,
      input.keyId,
      {
        objectType,
        objectId,
        vaultId,
        revision: sync.revision
      },
      payload
    )
  }
}

export async function loadVaultMetadataFromLocalObjects(
  userId: string,
  sessionId: string,
  keyId: string
): Promise<Vault[]> {
  const records = await queryEncryptedObjects(userId, { objectType: 'vault_metadata' })
  const payload = await decryptLocalObjectRecords(records, sessionId, keyId)
  return payload.vaults
}

export async function loadVaultScopedPayloadFromLocalObjects(
  userId: string,
  vaultId: string,
  sessionId: string,
  keyId: string
): Promise<DesktopVaultPayload> {
  const records = await queryEncryptedObjects(userId, { vaultId })
  return decryptLocalObjectRecords(
    records.filter((record) => record.objectType !== 'vault_metadata'),
    sessionId,
    keyId
  )
}

async function decryptLocalObjectRecords(
  records: EncryptedObjectRecord[],
  sessionId: string,
  keyId: string
): Promise<DesktopVaultPayload> {
  const payload: DesktopVaultPayload = {
    vaults: [],
    items: [],
    attachments: []
  }

  for (const record of records) {
    const metadata = {
      objectType: record.objectType,
      objectId: record.objectId,
      vaultId: record.vaultId,
      revision: record.revision
    }
    const decrypted = await decryptSyncObjectPayload<VaultObject>(sessionId, record.keyId || keyId, metadata, record.envelope)
    const sync: SyncMetadata = {
      revision: record.revision,
      baseRevision: record.baseRevision,
      updatedByDeviceId: decrypted.sync.updatedByDeviceId,
      deletedAt: record.deletedAt,
      state: record.syncState
    }

    if (record.objectType === 'vault_metadata') {
      payload.vaults.push({ ...(decrypted as Vault), sync })
    } else if (record.objectType === 'vault_item') {
      payload.items.push({ ...(decrypted as VaultItem), sync })
    } else {
      payload.attachments.push({ ...(decrypted as VaultAttachment), sync })
    }
  }

  return payload
}

async function makeSyncPushObject(
  input: SyncBuildInput,
  sync: SyncMetadata,
  objectType: SyncVaultObjectType,
  objectId: string,
  vaultId: string,
  payload: unknown
): Promise<SyncPushObject> {
  return {
    clientOperationId: crypto.randomUUID(),
    syncSpaceId: input.syncSpaceId,
    objectId,
    vaultId,
    objectType,
    baseRevision: sync.baseRevision,
    revision: sync.revision,
    encryptedPayload: await encryptSyncObjectPayload(
      input.sessionId,
      input.keyId,
      {
        objectType,
        objectId,
        vaultId,
        revision: sync.revision
      },
      payload
    ),
    deletedAt: sync.deletedAt
  }
}

export interface SyncStateContainer {
  settings: {
    sync: DesktopSyncSettings
  }
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
}

export type SyncObjectContainer = Pick<SyncStateContainer, 'vaults' | 'items' | 'attachments'>

export function applyAcceptedSyncObjects(store: SyncStateContainer, accepted: Array<{ objectId: string; revision: number }>): void {
  for (const result of accepted) {
    markLocalObjectSyncState(store, result.objectId, (sync) => ({
      ...sync,
      revision: result.revision,
      baseRevision: result.revision,
      state: 'clean'
    }))
  }
}

export function applyConflictedSyncObjects(store: SyncStateContainer, conflicts: Array<{ objectId: string }>): void {
  for (const conflict of conflicts) {
    markLocalObjectSyncState(store, conflict.objectId, (sync) => ({
      ...sync,
      state: 'conflicted'
    }))
  }
}

export function removeAcceptedDeletedObjects(store: SyncStateContainer, accepted: Array<{ objectId: string }>): void {
  const acceptedIds = new Set(accepted.map((result) => result.objectId))
  const deletedVaultIds = new Set(
    store.vaults
      .filter((vault) => vault.sync.deletedAt && serverIdsHasLocalId(acceptedIds, vault.id))
      .map((vault) => vault.id)
  )
  const deletedItemIds = new Set(
    store.items
      .filter((item) => (item.sync.deletedAt || deletedVaultIds.has(item.vaultId)) && serverIdsHasLocalId(acceptedIds, item.id))
      .map((item) => item.id)
  )

  store.vaults = store.vaults.filter((vault) => !(vault.sync.deletedAt && serverIdsHasLocalId(acceptedIds, vault.id)))
  store.items = store.items.filter((item) => !(item.sync.deletedAt && serverIdsHasLocalId(acceptedIds, item.id)) && !deletedVaultIds.has(item.vaultId))
  store.attachments = store.attachments.filter((attachment) =>
    !(attachment.sync.deletedAt && serverIdsHasLocalId(acceptedIds, attachment.id)) &&
    !deletedVaultIds.has(attachment.vaultId) &&
    !deletedItemIds.has(attachment.itemId)
  )
}

function markLocalObjectSyncState(
  store: SyncStateContainer,
  serverObjectId: string,
  update: (sync: SyncMetadata) => SyncMetadata
): void {
  store.vaults = store.vaults.map((vault) =>
    safeToServerUuid(vault.id) === serverObjectId ? { ...vault, sync: update(vault.sync) } : vault
  )
  store.items = store.items.map((item) =>
    safeToServerUuid(item.id) === serverObjectId ? { ...item, sync: update(item.sync) } : item
  )
  store.attachments = store.attachments.map((attachment) =>
    safeToServerUuid(attachment.id) === serverObjectId ? { ...attachment, sync: update(attachment.sync) } : attachment
  )
}

export function resetLoadedObjectsForNewSyncTarget(
  vaults: Vault[],
  items: VaultItem[],
  attachments: VaultAttachment[],
  deviceId: string
): void {
  for (const vault of vaults) {
    vault.sync = resetSyncForNewTarget(vault.sync, deviceId)
  }
  for (const item of items) {
    item.sync = resetSyncForNewTarget(item.sync, deviceId)
  }
  for (const attachment of attachments) {
    attachment.sync = resetSyncForNewTarget(attachment.sync, deviceId)
  }
}

function resetSyncForNewTarget(sync: SyncMetadata, deviceId: string): SyncMetadata {
  return {
    ...sync,
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: deviceId,
    state: 'dirty'
  }
}

export async function applyRemoteSyncObject(
  store: SyncObjectContainer,
  object: SyncObjectView,
  sessionId: string
): Promise<void> {
  if (object.deletedAt) {
    removeRemoteObject(store, object)
    return
  }

  const metadata = {
    objectType: object.objectType,
    objectId: object.objectId,
    vaultId: object.vaultId,
    revision: object.revision
  }
  const payload = await decryptSyncObjectPayload<Vault | VaultItem | VaultAttachment>(
    sessionId,
    object.encryptedPayload.keyId,
    metadata,
    object.encryptedPayload as EncryptedSyncObjectPayload
  )
  const sync = syncFromRemoteObject(object)

  if (object.objectType === 'vault_metadata') {
    const vault = { ...(payload as Vault), sync }
    store.vaults = upsertById(store.vaults, vault)
    return
  }

  if (object.objectType === 'vault_item') {
    const item = { ...(payload as VaultItem), sync }
    store.items = upsertById(store.items, item)
    return
  }

  const attachment = { ...(payload as VaultAttachment), sync }
  store.attachments = upsertById(store.attachments, attachment)
}

function removeRemoteObject(store: SyncObjectContainer, object: SyncObjectView): void {
  if (object.objectType === 'vault_metadata') {
    store.vaults = store.vaults.filter((vault) => safeToServerUuid(vault.id) !== object.objectId)
    return
  }
  if (object.objectType === 'vault_item') {
    store.items = store.items.filter((item) => safeToServerUuid(item.id) !== object.objectId)
    return
  }
  store.attachments = store.attachments.filter((attachment) => safeToServerUuid(attachment.id) !== object.objectId)
}

function syncFromRemoteObject(object: SyncObjectView): SyncMetadata {
  return {
    revision: object.revision,
    baseRevision: object.revision,
    updatedByDeviceId: object.updatedByDeviceId ?? '',
    deletedAt: object.deletedAt ?? null,
    state: 'clean'
  }
}

export function shouldRepairEmptyLocalSyncState(store: SyncStateContainer): boolean {
  if (!store.settings.sync.syncSpaceId || store.settings.sync.cursor <= 0) return false
  return store.vaults.length === 0 && store.items.length === 0 && store.attachments.length === 0
}

export function shouldResetLocalObjectsForInitialSync(store: SyncStateContainer): boolean {
  if (!store.settings.sync.syncSpaceId || store.settings.sync.cursor > 0 || store.settings.sync.lastSyncAt) return false
  const objects = [...store.vaults, ...store.items, ...store.attachments]
  return objects.length > 0 && objects.some((object) => object.sync.state === 'clean')
}

export async function restoreFromSyncSnapshot(input: {
  store: SyncStateContainer
  client: SyncApiClient
  deviceToken: string
  syncSpaceId: string
  sessionId: string
}): Promise<{ pulled: number; cursor: number }> {
  let pageToken: string | null = null
  let pulled = 0
  let cursor = input.store.settings.sync.cursor

  do {
    const snapshot = await input.client.snapshot(input.deviceToken, input.syncSpaceId, {
      pageToken,
      limit: 500
    })
    cursor = snapshot.snapshotCursor

    for (const object of snapshot.objects) {
      await applyRemoteSyncObject(input.store, object, input.sessionId)
      pulled += 1
    }

    pageToken = snapshot.nextPageToken ?? null
  } while (pageToken)

  return { pulled, cursor }
}

function withCleanSync<T extends { sync: SyncMetadata }>(value: T, revision: number): T {
  return {
    ...value,
    sync: {
      ...value.sync,
      revision,
      baseRevision: revision,
      state: 'clean'
    }
  }
}

function upsertById<T extends { id: string }>(items: T[], value: T): T[] {
  return items.some((item) => item.id === value.id)
    ? items.map((item) => (item.id === value.id ? value : item))
    : [value, ...items]
}

export function mergeById<T extends { id: string }>(items: T[], values: T[]): T[] {
  if (values.length === 0) return items
  const next = new Map(items.map((item) => [item.id, item]))
  for (const value of values) {
    next.set(value.id, value)
  }
  return [...next.values()]
}

export function countItemsByVault(items: VaultItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    if (!item.sync.deletedAt) {
      counts[item.vaultId] = (counts[item.vaultId] ?? 0) + 1
    }
    return counts
  }, {})
}

function shouldPushSync(sync: SyncMetadata): boolean {
  return sync.state === 'dirty' || sync.state === 'pending'
}

export function toServerUuid(id: string): string {
  return requireServerUuidFromLocalId(id)
}

function safeToServerUuid(id: string): string | null {
  return serverUuidFromLocalId(id)
}

function serverIdsHasLocalId(serverIds: Set<string>, localId: string): boolean {
  const serverId = safeToServerUuid(localId)
  return serverId ? serverIds.has(serverId) : false
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}
