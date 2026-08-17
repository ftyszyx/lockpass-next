import {
  deleteDeviceUnlockKey,
  deleteSecretKey,
  deleteSyncDeviceToken,
  loadSecretKey,
  saveSecretKey,
  type DesktopUserProfile,
  type StorageBackend
} from '@/services/vaultRepository'
import type { SecretKeyStorageStatus } from './types'

export async function saveAndVerifySecretKey(userId: string, secretKey: string): Promise<SecretKeyStorageStatus> {
  const savedSecretKey = await saveSecretKey(userId, secretKey)
  if (savedSecretKey.status !== 'saved') return 'unsupported'

  const loadedSecretKey = await loadSecretKey(userId)
  return loadedSecretKey.status === 'loaded' && loadedSecretKey.secretKey === secretKey ? 'saved' : 'failed'
}

export async function cleanupLocalSecretsForUser(user: DesktopUserProfile, storageBackend: StorageBackend): Promise<void> {
  const tasks: Array<Promise<{ status: string }>> = [
    deleteSecretKey(user.id),
    user.crypto?.fastUnlock
      ? deleteDeviceUnlockKey(
          user.crypto.fastUnlock.accountId,
          user.crypto.fastUnlock.userId,
          user.crypto.fastUnlock.deviceId,
          user.crypto.fastUnlock.deviceKeyId
        )
      : Promise.resolve({ status: 'deleted' }),
    deleteSyncDeviceToken(user.id).then(() => ({ status: 'deleted' }))
  ]
  const results = await Promise.allSettled(tasks)
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') {
    throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason))
  }
  if (storageBackend === 'tauri') {
    const notDeleted = results.find((result) => result.status === 'fulfilled' && result.value.status !== 'deleted')
    if (notDeleted?.status === 'fulfilled') {
      throw new Error(`failed to remove local secret: ${notDeleted.value.status}`)
    }
  }
}

export async function deleteFastUnlockSecretsForUsers(users: DesktopUserProfile[]): Promise<void> {
  await Promise.allSettled(
    users.flatMap((user) => {
      const fastUnlock = user.crypto?.fastUnlock
      return fastUnlock
        ? [
            deleteDeviceUnlockKey(
              fastUnlock.accountId,
              fastUnlock.userId,
              fastUnlock.deviceId,
              fastUnlock.deviceKeyId
            )
          ]
        : []
    })
  )
}
