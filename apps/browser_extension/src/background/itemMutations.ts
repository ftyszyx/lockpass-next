import { requireServerUuidFromLocalId } from '@lockpass/crypto'
import { loadEncryptedDeviceToken } from './deviceTokenStorage'
import { buildExtensionVaultItem, withCleanItemSync } from './itemMutationModel'
import {
  loadPanelState,
  saveUnlockedVault,
  setConnectionStatus,
  updateSelection
} from './repository'
import {
  encryptExtensionVaultObject,
  requireActiveExtensionVaultSession
} from './vaultUnlock'
import {
  ExtensionSyncClient,
  ExtensionSyncError,
  type ExtensionSyncPushObject
} from '@/services/extensionSyncClient'
import type { ExtensionItemSaveInput, ExtensionPanelState } from '@/shared/models'

export async function saveExtensionVaultItem(
  input: ExtensionItemSaveInput
): Promise<ExtensionPanelState> {
  const state = await loadPanelState()
  if (!state.account || !state.unlocked) throw new Error('vault-locked')
  if (!state.vaults.some((vault) => vault.id === input.vaultId && !vault.sync.deletedAt)) {
    throw new Error('vault-not-found')
  }

  const existing = input.editingItemId
    ? state.items.find((item) => item.id === input.editingItemId) ?? null
    : null
  if (input.editingItemId && !existing) throw new Error('item-not-found')
  if (!existing && input.type === 'attachment') throw new Error('attachment-create-unsupported')

  const session = requireActiveExtensionVaultSession(
    state.account.serverUrl,
    state.account.id
  )
  const deviceToken = await loadEncryptedDeviceToken(
    state.account.serverUrl,
    state.account.id
  )
  if (!deviceToken) throw new Error('device-authorization-missing')

  const item = buildExtensionVaultItem(input, existing, state.account.deviceId)
  const objectId = requireServerUuidFromLocalId(item.id)
  const vaultId = requireServerUuidFromLocalId(item.vaultId)
  const payload = withCleanItemSync(item, item.sync.revision)
  const encryptedPayload = await encryptExtensionVaultObject(
    state.account.serverUrl,
    state.account.id,
    {
      objectType: 'vault_item',
      objectId,
      vaultId,
      revision: item.sync.revision
    },
    payload
  )
  const pushObject: ExtensionSyncPushObject = {
    clientOperationId: crypto.randomUUID(),
    syncSpaceId: session.syncSpaceId,
    objectId,
    vaultId,
    objectType: 'vault_item',
    baseRevision: item.sync.baseRevision,
    revision: item.sync.revision,
    encryptedPayload,
    deletedAt: null
  }

  try {
    const client = new ExtensionSyncClient(state.account.serverUrl)
    const result = await client.push(deviceToken, [pushObject])
    if (result.conflicts.length) throw new Error('item-conflict')
    if (result.rejected.length) throw new Error('item-save-rejected')
    const accepted = result.accepted.find((candidate) => candidate.objectId === objectId)
    if (!accepted) throw new Error('item-save-rejected')

    const savedItem = withCleanItemSync(item, accepted.revision)
    const items = existing
      ? state.items.map((candidate) => candidate.id === savedItem.id ? savedItem : candidate)
      : [savedItem, ...state.items]
    await saveUnlockedVault(state.vaults, items)
    await updateSelection({ vaultId: savedItem.vaultId, itemId: savedItem.id })
    await client.ack(deviceToken, result.nextCursor).catch(() => undefined)
    return loadPanelState()
  } catch (error) {
    if (error instanceof ExtensionSyncError) {
      await setConnectionStatus(error.network ? 'serverUnavailable' : 'offline')
      if (error.status === 401 || error.status === 403) throw new Error('device-authorization-expired')
      if (error.network) throw new Error('server-unavailable')
      throw new Error('item-save-failed')
    }
    throw error
  }
}
