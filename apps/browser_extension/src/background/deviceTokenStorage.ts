import { loadEncryptedSecret, saveEncryptedSecret } from './encryptedSecretStorage'

const DEVICE_TOKEN_KEY_ID = 'device-token-key'
const DEVICE_TOKEN_SECRET_ID = 'device-token'

export async function saveEncryptedDeviceToken(accountId: string, token: string): Promise<void> {
  await saveEncryptedSecret(deviceTokenLocator(accountId), token)
}

export async function loadEncryptedDeviceToken(accountId: string): Promise<string | null> {
  return loadEncryptedSecret(deviceTokenLocator(accountId))
}

function deviceTokenLocator(accountId: string) {
  return {
    accountId,
    keyId: DEVICE_TOKEN_KEY_ID,
    secretId: DEVICE_TOKEN_SECRET_ID,
    additionalData: accountId
  }
}
