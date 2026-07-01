import {
  deleteDeviceUnlockKey,
  deleteRecoveryKey,
  deleteSyncDeviceToken,
  loadRecoveryKey,
  saveRecoveryKey,
  type DesktopUserProfile,
  type StorageBackend
} from '@/services/vaultRepository'
import type { RecoveryKeyStorageStatus } from './types'

export async function saveAndVerifyRecoveryKey(userId: string, recoveryKey: string): Promise<RecoveryKeyStorageStatus> {
  const savedRecoveryKey = await saveRecoveryKey(userId, recoveryKey)
  if (savedRecoveryKey.status !== 'saved') return 'unsupported'

  const loadedRecoveryKey = await loadRecoveryKey(userId)
  return loadedRecoveryKey.status === 'loaded' && loadedRecoveryKey.recoveryKey === recoveryKey ? 'saved' : 'failed'
}

export async function cleanupLocalSecretsForUser(user: DesktopUserProfile, storageBackend: StorageBackend): Promise<void> {
  const tasks: Array<Promise<{ status: string }>> = [
    deleteRecoveryKey(user.id),
    user.crypto?.fastUnlock
      ? deleteDeviceUnlockKey(
          user.crypto.fastUnlock.accountId,
          user.id,
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
