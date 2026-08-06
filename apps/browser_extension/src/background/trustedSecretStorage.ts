import { loadEncryptedSecret, saveEncryptedSecret } from './encryptedSecretStorage'

const PURPOSE = 'lockpass extension trusted secret key v1'

export async function saveTrustedSecretKey(accountId: string, secretKey: string): Promise<void> {
  const locator = trustedSecretLocator(accountId)
  await saveEncryptedSecret(locator, secretKey)
  if (await loadEncryptedSecret(locator) !== secretKey) {
    throw new Error('trusted-secret-storage-failed')
  }
}

export async function loadTrustedSecretKey(accountId: string): Promise<string | null> {
  return loadEncryptedSecret(trustedSecretLocator(accountId))
}

export async function hasTrustedSecretKey(accountId: string): Promise<boolean> {
  return Boolean(await loadEncryptedSecret(trustedSecretLocator(accountId)))
}

function trustedSecretLocator(accountId: string) {
  return {
    accountId,
    keyId: `trusted-secret-key:${accountId}`,
    secretId: `trusted-secret:${accountId}`,
    additionalData: JSON.stringify({ purpose: PURPOSE, accountId })
  }
}
