import type { SyncMetadata, Vault } from '@lockpass/core'
import {
  createUserCrypto,
  encryptSyncObjectPayload,
  requireServerUuidFromLocalId,
  type DesktopUserCrypto,
  type DesktopVaultPayload
} from '@/services/masterPassword'
import { SyncApiClient, type SyncDeviceBindCallbackPayload } from '@/services/syncClient'

export interface InitialServerVaultInput {
  binding: SyncDeviceBindCallbackPayload
  masterPassword: string
  recoveryKey: string
  defaultVaultName: string
  defaultVaultDescription: string
}

export interface InitialServerVaultResult {
  payload: DesktopVaultPayload
  crypto: DesktopUserCrypto
  vaultKey: Uint8Array
  syncSpaceId: string
  cursor: number
}

export async function createInitialServerVault(input: InitialServerVaultInput): Promise<InitialServerVaultResult> {
  const client = new SyncApiClient(input.binding.serverUrl)
  const syncSpace = await ensureDefaultSyncSpace(client, input.binding.deviceToken)
  const payload = createInitialVaultPayload({
    deviceId: input.binding.device.id,
    defaultVaultName: input.defaultVaultName,
    defaultVaultDescription: input.defaultVaultDescription
  })
  const created = await createUserCrypto(input.binding.account.id, input.masterPassword, payload, input.recoveryKey)
  const vault = payload.vaults[0]
  const vaultId = requireServerUuidFromLocalId(vault.id)

  await client.createWrappedVaultKey(input.binding.deviceToken, {
    syncSpaceId: syncSpace.id,
    vaultId,
    keyId: created.crypto.keyId,
    wrapType: 'user_wrapped',
    kdfParams: created.crypto.kdfParams,
    wrappedVaultKey: created.crypto.wrappedVaultKey
  })

  const cleanVault: Vault = {
    ...vault,
    sync: {
      ...vault.sync,
      baseRevision: 1,
      state: 'clean'
    }
  }
  const pushResult = await client.pushSync(input.binding.deviceToken, [
    {
      clientOperationId: crypto.randomUUID(),
      syncSpaceId: syncSpace.id,
      objectId: vaultId,
      vaultId,
      objectType: 'vault_metadata',
      baseRevision: 0,
      revision: 1,
      encryptedPayload: await encryptSyncObjectPayload(
        created.vaultKey,
        created.crypto.keyId,
        {
          objectType: 'vault_metadata',
          objectId: vaultId,
          vaultId,
          revision: 1
        },
        cleanVault
      ),
      deletedAt: null
    }
  ])

  if (pushResult.rejected.length > 0 || pushResult.conflicts.length > 0 || pushResult.accepted.length !== 1) {
    throw new Error('initialVaultUploadFailed')
  }
  await client.ackSync(input.binding.deviceToken, pushResult.nextCursor)

  return {
    payload: {
      ...payload,
      vaults: [cleanVault]
    },
    crypto: created.crypto,
    vaultKey: created.vaultKey,
    syncSpaceId: syncSpace.id,
    cursor: pushResult.nextCursor
  }
}

async function ensureDefaultSyncSpace(client: SyncApiClient, deviceToken: string): Promise<{ id: string }> {
  const spaces = await client.syncSpaces(deviceToken)
  return spaces.syncSpaces.find((space) => space.displayName === 'default')
    ?? (await client.createSyncSpace(deviceToken, 'default')).syncSpace
}

function createInitialVaultPayload(input: {
  deviceId: string
  defaultVaultName: string
  defaultVaultDescription: string
}): DesktopVaultPayload {
  const now = new Date().toISOString()
  const vault: Vault = {
    id: `vault-${crypto.randomUUID()}`,
    schemaVersion: 1,
    name: input.defaultVaultName,
    description: input.defaultVaultDescription,
    color: 'slate',
    icon: 'folder-lock',
    createdAt: now,
    updatedAt: now,
    sync: createInitialSync(input.deviceId)
  }

  return {
    vaults: [vault],
    items: [],
    attachments: []
  }
}

function createInitialSync(deviceId: string): SyncMetadata {
  return {
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: deviceId,
    deletedAt: null,
    state: 'dirty'
  }
}
