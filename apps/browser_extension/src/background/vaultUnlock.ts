import type { Vault, VaultItem } from '@lockpass/core'
import {
  WebVaultCryptoProvider,
  type EncryptedSyncObjectPayload,
  type UserCryptoConfig
} from '@lockpass/crypto'
import { loadEncryptedDeviceToken } from './deviceTokenStorage'
import {
  loadPanelState,
  saveUnlockedVault,
  setConnectionStatus
} from './repository'
import {
  loadTrustedSecretKey,
  saveTrustedSecretKey
} from './trustedSecretStorage'
import {
  ExtensionSyncClient,
  ExtensionSyncError,
  type ExtensionSyncObject,
  type ExtensionSyncSnapshot,
  type ExtensionWrappedVaultKey
} from '@/services/extensionSyncClient'
import type { ExtensionPanelState } from '@/shared/models'

const cryptoProvider = new WebVaultCryptoProvider()
let activeVaultSession: ActiveExtensionVaultSession | null = null

export interface ActiveExtensionVaultSession {
  accountId: string
  sessionId: string
  keyId: string
  syncSpaceId: string
}

export async function unlockExtensionVault(input: {
  password: string
  secretKey?: string
}): Promise<ExtensionPanelState> {
  const state = await loadPanelState()
  if (!state.account) throw new Error('account-missing')
  if (!input.password) throw new Error('master-password-required')

  const deviceToken = await loadEncryptedDeviceToken(state.account.id)
  if (!deviceToken) throw new Error('device-authorization-missing')

  const storedSecretKey = await loadTrustedSecretKey(state.account.id).catch(() => null)
  const suppliedSecretKey = input.secretKey?.trim() || ''
  const secretKey = suppliedSecretKey || storedSecretKey
  if (!secretKey) throw new Error('secret-key-required')

  try {
    const client = new ExtensionSyncClient(state.account.serverUrl)
    const spaces = await client.syncSpaces(deviceToken)
    const syncSpace = spaces.syncSpaces.find((space) => space.displayName === 'default')
      ?? spaces.syncSpaces[0]
    if (!syncSpace) throw new Error('server-vault-missing')

    const snapshot = await loadCompleteSnapshot(client, deviceToken, syncSpace.id)
    const wrappedVaultKey = snapshot.wrappedVaultKeys?.[0]
    if (!wrappedVaultKey) throw new Error('server-vault-key-missing')

    await cryptoProvider.closeAllSessions()
    activeVaultSession = null
    const session = await unlockCryptoSession(
      state.account.id,
      input.password,
      secretKey,
      wrappedVaultKey
    )
    const decrypted = await decryptSnapshot(snapshot.objects, session.sessionId)
    if (!storedSecretKey && suppliedSecretKey) {
      await saveTrustedSecretKey(state.account.id, suppliedSecretKey)
    }
    activeVaultSession = {
      accountId: state.account.id,
      sessionId: session.sessionId,
      keyId: wrappedVaultKey.keyId,
      syncSpaceId: syncSpace.id
    }
    await saveUnlockedVault(decrypted.vaults, decrypted.items)
    return loadPanelState()
  } catch (error) {
    await cryptoProvider.closeAllSessions()
    activeVaultSession = null
    if (error instanceof ExtensionSyncError) {
      await setConnectionStatus(error.network ? 'serverUnavailable' : 'offline')
      if (error.status === 401 || error.status === 403) throw new Error('device-authorization-expired')
      if (error.network) throw new Error('server-unavailable')
      throw new Error('server-request-failed')
    }
    if (isKnownUnlockError(error)) throw error
    throw new Error('unlock-credentials-invalid')
  }
}

export async function closeExtensionVaultSession(): Promise<void> {
  await cryptoProvider.closeAllSessions()
  activeVaultSession = null
}

export function requireActiveExtensionVaultSession(accountId: string): ActiveExtensionVaultSession {
  if (!activeVaultSession || activeVaultSession.accountId !== accountId) {
    throw new Error('vault-session-expired')
  }
  return activeVaultSession
}

export function hasActiveExtensionVaultSession(accountId: string): boolean {
  return activeVaultSession?.accountId === accountId
}

export async function encryptExtensionVaultObject(
  accountId: string,
  metadata: {
    objectType: 'vault_item' | 'vault_attachment' | 'vault_metadata'
    objectId: string
    vaultId: string
    revision: number
  },
  payload: unknown
): Promise<EncryptedSyncObjectPayload> {
  const session = requireActiveExtensionVaultSession(accountId)
  return cryptoProvider.encryptObject(session.sessionId, session.keyId, metadata, payload)
}

async function loadCompleteSnapshot(
  client: ExtensionSyncClient,
  token: string,
  syncSpaceId: string
): Promise<ExtensionSyncSnapshot> {
  let pageToken: string | null = null
  let firstPage: ExtensionSyncSnapshot | null = null
  const objects: ExtensionSyncObject[] = []

  do {
    const page = await client.snapshot(token, syncSpaceId, pageToken)
    firstPage ??= page
    objects.push(...page.objects)
    pageToken = page.nextPageToken ?? null
  } while (pageToken)

  if (!firstPage) throw new Error('server-vault-missing')
  return { ...firstPage, objects, nextPageToken: null }
}

async function unlockCryptoSession(
  accountId: string,
  password: string,
  secretKey: string,
  wrapped: ExtensionWrappedVaultKey
) {
  const cryptoConfig: UserCryptoConfig = {
    keyId: wrapped.keyId,
    kdfParams: wrapped.kdfParams,
    wrappedVaultKey: wrapped.wrappedVaultKey
  }
  try {
    return await cryptoProvider.unlockUser({
      userId: accountId,
      password,
      secretKey,
      cryptoConfig
    })
  } catch {
    throw new Error('unlock-credentials-invalid')
  }
}

async function decryptSnapshot(
  objects: ExtensionSyncObject[],
  sessionId: string
): Promise<{ vaults: Vault[]; items: VaultItem[] }> {
  const vaults = new Map<string, Vault>()
  const items = new Map<string, VaultItem>()

  for (const object of objects) {
    if (object.deletedAt || object.objectType === 'vault_attachment') continue
    const payload = await cryptoProvider.decryptObject<Vault | VaultItem>(
      sessionId,
      object.encryptedPayload.keyId,
      {
        objectType: object.objectType,
        objectId: object.objectId,
        vaultId: object.vaultId,
        revision: object.revision
      },
      object.encryptedPayload
    )
    const sync = {
      revision: object.revision,
      baseRevision: object.revision,
      updatedByDeviceId: object.updatedByDeviceId ?? '',
      deletedAt: null,
      state: 'clean' as const
    }
    if (object.objectType === 'vault_metadata') {
      const vault = { ...(payload as Vault), sync }
      vaults.set(vault.id, vault)
    } else {
      const item = { ...(payload as VaultItem), sync }
      items.set(item.id, item)
    }
  }

  return { vaults: [...vaults.values()], items: [...items.values()] }
}

function isKnownUnlockError(error: unknown): error is Error {
  return error instanceof Error && [
    'server-vault-missing',
    'server-vault-key-missing',
    'secret-key-required',
    'master-password-required',
    'device-authorization-missing',
    'device-authorization-expired',
    'server-unavailable',
    'server-request-failed',
    'trusted-secret-storage-failed',
    'unlock-credentials-invalid'
  ].includes(error.message)
}
