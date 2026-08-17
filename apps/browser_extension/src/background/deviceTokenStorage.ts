import { loadEncryptedSecret, saveEncryptedSecret } from './encryptedSecretStorage'
import { serverAccountStorageScope } from './accountScope'

const DEVICE_TOKEN_KEY_ID = 'device-token-key'
const DEVICE_TOKEN_SECRET_ID = 'device-token'

export async function saveEncryptedDeviceToken(
  serverUrl: string,
  accountId: string,
  token: string
): Promise<void> {
  await saveEncryptedSecret(deviceTokenLocator(serverUrl, accountId), token)
}

export async function loadEncryptedDeviceToken(serverUrl: string, accountId: string): Promise<string | null> {
  return loadEncryptedSecret(deviceTokenLocator(serverUrl, accountId))
}

function deviceTokenLocator(serverUrl: string, accountId: string) {
  const accountScope = serverAccountStorageScope(serverUrl, accountId)
  return {
    accountId: accountScope,
    keyId: `${DEVICE_TOKEN_KEY_ID}:${accountScope}`,
    secretId: `${DEVICE_TOKEN_SECRET_ID}:${accountScope}`,
    additionalData: accountScope
  }
}
