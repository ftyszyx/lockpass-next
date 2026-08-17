import { changeUserMasterPassword } from '@/services/masterPassword'
import { SyncApiClient } from '@/services/syncClient'
import {
  loadSecretKey,
  loadSyncDeviceToken,
  saveVaultStore,
  type DesktopUserProfile,
  type DesktopVaultStoreData
} from '@/services/vaultRepository'
import { DESKTOP_STORE_SCHEMA_VERSION, snapshotActiveUser } from './model'
import { syncServerUrlForSettings } from './syncConnection'
import { toServerUuid } from './syncObjects'
import { cryptoUserIdForUser } from './userIdentity'

interface ChangeMasterPasswordInput {
  activeUserId: string | null
  currentPassword: string
  newPassword: string
  sessionId: string
  settings: DesktopVaultStoreData['settings']
  user: DesktopUserProfile
  users: DesktopUserProfile[]
}

interface ChangeMasterPasswordResult {
  serverBacked: boolean
  users: DesktopUserProfile[]
}

export async function changeStoredMasterPassword(
  input: ChangeMasterPasswordInput
): Promise<ChangeMasterPasswordResult> {
  if (!input.user.crypto) throw new Error('syncLocked')

  const savedSecretKey = await loadSecretKey(input.user.id)
  if (savedSecretKey.status !== 'loaded') {
    throw new Error(savedSecretKey.status === 'unsupported'
      ? 'masterPasswordSecretKeyUnsupported'
      : 'masterPasswordSecretKeyMissing')
  }

  const nextCrypto = await changeUserMasterPassword(
    cryptoUserIdForUser(input.user),
    input.sessionId,
    input.currentPassword,
    input.newPassword,
    savedSecretKey.secretKey,
    input.user.crypto
  )
  const nextUsers = input.users.map((candidate) => candidate.id === input.user.id
    ? { ...candidate, crypto: nextCrypto, updatedAt: new Date().toISOString() }
    : candidate)
  const serverBacked = Boolean(input.user.sync?.accountId || input.settings.sync.accountId)
  const serverUpdate = serverBacked
    ? await prepareServerKeyUpdate(input.user, input.settings, nextCrypto)
    : null

  await saveVaultStore(storeData(input, nextUsers))
  try {
    if (serverUpdate) {
      await serverUpdate.client.createWrappedVaultKey(serverUpdate.token, {
        syncSpaceId: serverUpdate.syncSpaceId,
        vaultId: serverUpdate.vaultId,
        keyId: nextCrypto.keyId,
        wrapType: 'user_wrapped',
        replacesWrappedVaultKeyId: serverUpdate.replacesWrappedVaultKeyId,
        kdfParams: nextCrypto.kdfParams,
        wrappedVaultKey: nextCrypto.wrappedVaultKey
      })
    }
  } catch (error) {
    await saveVaultStore(storeData(input, input.users)).catch(() => undefined)
    throw error
  }

  return { serverBacked, users: nextUsers }
}

async function prepareServerKeyUpdate(
  user: DesktopUserProfile,
  settings: DesktopVaultStoreData['settings'],
  nextCrypto: NonNullable<DesktopUserProfile['crypto']>
) {
  const token = await loadSyncDeviceToken(user.id)
  const syncSpaceId = settings.sync.syncSpaceId
  if (!token || !syncSpaceId || !settings.sync.deviceId) {
    throw new Error('masterPasswordSyncRequired')
  }

  const client = new SyncApiClient(syncServerUrlForSettings(settings.sync))
  const vaultId = toServerUuid(nextCrypto.wrappedVaultKey.aad.vaultId)
  const response = await client.wrappedVaultKeys(token, syncSpaceId)
  const currentKey = response.wrappedVaultKeys.find((candidate) =>
    candidate.keyId === nextCrypto.keyId && candidate.vaultId === vaultId)
  if (!currentKey) throw new Error('serverVaultKeyMissing')

  return {
    client,
    token,
    syncSpaceId,
    vaultId,
    replacesWrappedVaultKeyId: currentKey.id
  }
}

function storeData(
  input: ChangeMasterPasswordInput,
  users: DesktopUserProfile[]
): DesktopVaultStoreData {
  return {
    schemaVersion: DESKTOP_STORE_SCHEMA_VERSION,
    activeUserId: input.activeUserId,
    users: snapshotActiveUser(users, input.activeUserId, input.settings.sync),
    settings: input.settings
  }
}
