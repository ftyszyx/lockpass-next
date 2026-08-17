import { loadEncryptedSecret, saveEncryptedSecret } from './encryptedSecretStorage'
import { serverAccountStorageScope } from './accountScope'

const PURPOSE = 'lockpass extension trusted secret key v1'

export async function saveTrustedSecretKey(
  serverUrl: string,
  accountId: string,
  secretKey: string
): Promise<void> {
  const locator = trustedSecretLocator(serverUrl, accountId)
  await saveEncryptedSecret(locator, secretKey)
  if (await loadEncryptedSecret(locator) !== secretKey) {
    throw new Error('trusted-secret-storage-failed')
  }
}

export async function loadTrustedSecretKey(serverUrl: string, accountId: string): Promise<string | null> {
  return loadEncryptedSecret(trustedSecretLocator(serverUrl, accountId))
}

export async function hasTrustedSecretKey(serverUrl: string, accountId: string): Promise<boolean> {
  return Boolean(await loadTrustedSecretKey(serverUrl, accountId))
}

function trustedSecretLocator(serverUrl: string, accountId: string) {
  const accountScope = serverAccountStorageScope(serverUrl, accountId)
  return {
    accountId: accountScope,
    keyId: `trusted-secret-key:${accountScope}`,
    secretId: `trusted-secret:${accountScope}`,
    additionalData: JSON.stringify({ purpose: PURPOSE, accountScope })
  }
}
