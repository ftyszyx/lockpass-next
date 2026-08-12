import type { SyncMetadata, Vault, VaultAttachment, VaultItem } from '@lockpass/core'
import {
  decryptSyncObjectPayload,
  serverUuidFromLocalId,
  type EncryptedSyncObjectPayload
} from '@/services/masterPassword'
import type {
  SyncApiClient,
  SyncConflict,
  SyncObjectView
} from '@/services/syncClient'
import {
  applyConflictedSyncObjects,
  applyRemoteSyncObject,
  type SyncObjectContainer,
  type SyncStateContainer
} from './syncObjects'

type VaultObject = Vault | VaultItem | VaultAttachment

export async function reconcilePushConflicts(
  store: SyncStateContainer,
  conflicts: SyncConflict[],
  sessionId: string
): Promise<{ resolved: number; unresolved: number }> {
  let resolved = 0
  let unresolved = 0

  for (const conflict of conflicts) {
    if (
      conflict.serverObject &&
      await remoteObjectMatchesLocalContent(store, conflict.serverObject, sessionId)
    ) {
      await applyRemoteSyncObject(store, conflict.serverObject, sessionId)
      resolved += 1
      continue
    }

    applyConflictedSyncObjects(store, [conflict])
    unresolved += 1
  }

  return { resolved, unresolved }
}

export async function applyPulledSyncObject(
  store: SyncStateContainer,
  object: SyncObjectView,
  sessionId: string
): Promise<'applied' | 'skipped' | 'conflicted'> {
  const local = findLocalObject(store, object.objectId)
  if (!local) {
    await applyRemoteSyncObject(store, object, sessionId)
    return 'applied'
  }

  if (local.sync.state === 'clean') {
    if (local.sync.revision >= object.revision) return 'skipped'
    await applyRemoteSyncObject(store, object, sessionId)
    return 'applied'
  }

  if (local.sync.state === 'conflicted') {
    if (await remoteObjectMatchesLocalContent(store, object, sessionId)) {
      await applyRemoteSyncObject(store, object, sessionId)
      return 'applied'
    }
    return 'skipped'
  }

  if (object.revision <= local.sync.baseRevision) return 'skipped'
  if (await remoteObjectMatchesLocalContent(store, object, sessionId)) {
    await applyRemoteSyncObject(store, object, sessionId)
    return 'applied'
  }

  markLocalObjectSyncState(store, object.objectId, (sync) => ({
    ...sync,
    state: 'conflicted'
  }))
  return 'conflicted'
}

export async function reconcileLocalObjectsWithSyncSnapshot(input: {
  store: SyncStateContainer
  client: SyncApiClient
  deviceToken: string
  syncSpaceId: string
  sessionId: string
  deviceId: string
}): Promise<{
  cursor: number
  downloaded: number
  preservedLocalChanges: number
  conflicts: number
  resetForUpload: number
}> {
  const snapshot = await loadSyncSnapshotObjects(
    input.client,
    input.deviceToken,
    input.syncSpaceId
  )
  let downloaded = 0
  let preservedLocalChanges = 0
  let conflicts = 0

  for (const remote of snapshot.objects) {
    const local = findLocalObject(input.store, remote.objectId)
    if (!local) {
      await applyRemoteSyncObject(input.store, remote, input.sessionId)
      downloaded += 1
      continue
    }

    if (remote.deletedAt) {
      if (local.sync.state === 'clean' || local.sync.deletedAt) {
        await applyRemoteSyncObject(input.store, remote, input.sessionId)
        downloaded += 1
      } else {
        markLocalObjectSyncState(input.store, remote.objectId, (sync) => ({
          ...sync,
          state: 'conflicted'
        }))
        conflicts += 1
      }
      continue
    }

    if (await remoteObjectMatchesLocalContent(input.store, remote, input.sessionId)) {
      await applyRemoteSyncObject(input.store, remote, input.sessionId)
      downloaded += 1
      continue
    }

    if (
      (local.sync.state === 'dirty' || local.sync.state === 'pending') &&
      local.sync.baseRevision === remote.revision
    ) {
      preservedLocalChanges += 1
      continue
    }

    if (local.sync.state === 'clean' && local.sync.revision <= remote.revision) {
      await applyRemoteSyncObject(input.store, remote, input.sessionId)
      downloaded += 1
      continue
    }

    markLocalObjectSyncState(input.store, remote.objectId, (sync) => ({
      ...sync,
      state: 'conflicted'
    }))
    conflicts += 1
  }

  const resetForUpload = resetObjectsMissingFromSyncSnapshot(
    input.store.vaults,
    input.store.items,
    input.store.attachments,
    snapshot.objects,
    input.deviceId
  )

  return {
    cursor: snapshot.cursor,
    downloaded,
    preservedLocalChanges,
    conflicts,
    resetForUpload
  }
}

export async function repairEquivalentSyncConflictsFromSnapshot(input: {
  store: SyncStateContainer
  client: SyncApiClient
  deviceToken: string
  syncSpaceId: string
  sessionId: string
}): Promise<number> {
  if (!hasConflictedObjects(input.store)) return 0

  const snapshot = await loadSyncSnapshotObjects(
    input.client,
    input.deviceToken,
    input.syncSpaceId
  )
  let repaired = 0

  for (const object of snapshot.objects) {
    const local = findLocalObject(input.store, object.objectId)
    if (local?.sync.state !== 'conflicted') continue
    if (!(await remoteObjectMatchesLocalContent(input.store, object, input.sessionId))) {
      continue
    }
    await applyRemoteSyncObject(input.store, object, input.sessionId)
    repaired += 1
  }

  return repaired
}

export function resetObjectsMissingFromSyncSnapshot(
  vaults: Vault[],
  items: VaultItem[],
  attachments: VaultAttachment[],
  remoteObjects: SyncObjectView[],
  deviceId: string
): number {
  const remoteObjectIds = new Set(remoteObjects.map((object) => object.objectId))
  let resetCount = 0

  for (const object of [...vaults, ...items, ...attachments]) {
    const serverObjectId = safeToServerUuid(object.id)
    if (serverObjectId && remoteObjectIds.has(serverObjectId)) continue
    object.sync = resetSyncForNewTarget(object.sync, deviceId)
    resetCount += 1
  }

  return resetCount
}

export function vaultObjectsHaveSameContent(left: VaultObject, right: VaultObject): boolean {
  return JSON.stringify(comparableObjectContent(left)) === JSON.stringify(comparableObjectContent(right))
}

async function loadSyncSnapshotObjects(
  client: SyncApiClient,
  deviceToken: string,
  syncSpaceId: string
): Promise<{ objects: SyncObjectView[]; cursor: number }> {
  let pageToken: string | null = null
  let cursor = 0
  const objects: SyncObjectView[] = []

  do {
    const snapshot = await client.snapshot(deviceToken, syncSpaceId, {
      pageToken,
      limit: 500
    })
    cursor = snapshot.snapshotCursor
    objects.push(...snapshot.objects)
    pageToken = snapshot.nextPageToken ?? null
  } while (pageToken)

  return { objects, cursor }
}

async function remoteObjectMatchesLocalContent(
  store: SyncObjectContainer,
  object: SyncObjectView,
  sessionId: string
): Promise<boolean> {
  const local = findLocalObject(store, object.objectId)
  if (!local) return false
  if (object.deletedAt) {
    return Boolean(local.sync.deletedAt && local.sync.deletedAt === object.deletedAt)
  }

  const remote = await decryptRemoteSyncObject(object, sessionId)
  return remote ? vaultObjectsHaveSameContent(local, remote) : false
}

async function decryptRemoteSyncObject(
  object: SyncObjectView,
  sessionId: string
): Promise<VaultObject | null> {
  if (object.deletedAt) return null
  const metadata = {
    objectType: object.objectType,
    objectId: object.objectId,
    vaultId: object.vaultId,
    revision: object.revision
  }
  return decryptSyncObjectPayload<VaultObject>(
    sessionId,
    object.encryptedPayload.keyId,
    metadata,
    object.encryptedPayload as EncryptedSyncObjectPayload
  )
}

function findLocalObject(store: SyncObjectContainer, serverObjectId: string): VaultObject | null {
  return [...store.vaults, ...store.items, ...store.attachments].find(
    (object) => safeToServerUuid(object.id) === serverObjectId
  ) ?? null
}

function markLocalObjectSyncState(
  store: SyncObjectContainer,
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

function resetSyncForNewTarget(sync: SyncMetadata, deviceId: string): SyncMetadata {
  return {
    ...sync,
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: deviceId,
    state: 'dirty'
  }
}

function comparableObjectContent(value: VaultObject): unknown {
  const { sync: _sync, ...content } = value
  return sortJsonValue(content)
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJsonValue(child)])
  )
}

function hasConflictedObjects(store: SyncObjectContainer): boolean {
  return [...store.vaults, ...store.items, ...store.attachments].some(
    (object) => object.sync.state === 'conflicted'
  )
}

function safeToServerUuid(id: string): string | null {
  return serverUuidFromLocalId(id)
}
