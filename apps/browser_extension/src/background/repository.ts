import type { Vault, VaultItem, VaultItemField } from '@lockpass/core'
import { saveEncryptedDeviceToken } from './deviceTokenStorage'
import { hasTrustedSecretKey } from './trustedSecretStorage'
import { itemsMatchingOrigin } from '@/services/originMatcher'
import {
  EXTENSION_SCHEMA_VERSION,
  type ExtensionLocale,
  type ExtensionDeviceAuthorization,
  type ExtensionPanelState,
  type ExtensionPersistentState,
  type ExtensionSessionState,
  type FillCredentialPayload
} from '@/shared/models'

const PERSISTENT_STATE_KEY = 'lockpass.extension.persistent.v1'
const SESSION_STATE_KEY = 'lockpass.extension.session.v1'
const CLIENT_DEVICE_ID_KEY = 'lockpass.extension.clientDeviceId.v1'

export async function loadPanelState(): Promise<ExtensionPanelState> {
  const persistent = await loadPersistentState()
  const [session, siteAccessEnabled, trustedSecretAvailable] = await Promise.all([
    loadSessionState(),
    hasSiteAccess(),
    persistent.account
      ? hasTrustedSecretKey(persistent.account.id).catch(() => false)
      : Promise.resolve(false)
  ])

  return {
    ...persistent,
    ...session,
    requiresSecretKey: Boolean(persistent.account) && !trustedSecretAvailable,
    siteAccessEnabled
  }
}

export async function saveUnlockedVault(vaults: Vault[], items: VaultItem[]): Promise<void> {
  const state = await loadSessionState()
  const selectedVaultId = state.selectedVaultId === 'all' || vaults.some((vault) => vault.id === state.selectedVaultId)
    ? state.selectedVaultId
    : 'all'
  const selectedItemId = items.some((item) => item.id === state.selectedItemId)
    ? state.selectedItemId
    : null
  await saveSessionState({
    ...state,
    unlocked: true,
    selectedVaultId,
    selectedItemId,
    connectionStatus: 'online',
    vaults,
    items
  })
}

export async function setConnectionStatus(
  connectionStatus: ExtensionSessionState['connectionStatus']
): Promise<void> {
  const state = await loadSessionState()
  await saveSessionState({ ...state, connectionStatus })
}

export async function updateSelection(input: {
  vaultId?: 'all' | string
  itemId?: string | null
}): Promise<void> {
  const state = await loadSessionState()
  await saveSessionState({
    ...state,
    selectedVaultId: input.vaultId ?? state.selectedVaultId,
    selectedItemId: input.itemId === undefined ? state.selectedItemId : input.itemId
  })
}

export async function setActiveOrigin(origin: string): Promise<void> {
  const state = await loadSessionState()
  await saveSessionState({ ...state, activeOrigin: origin })
}

export async function loadOrCreateClientDeviceId(): Promise<string> {
  const stored = await chrome.storage.local.get(CLIENT_DEVICE_ID_KEY)
  const existing = stored[CLIENT_DEVICE_ID_KEY]
  if (typeof existing === 'string' && existing) return existing
  const next = `extension-${crypto.randomUUID()}`
  await chrome.storage.local.set({ [CLIENT_DEVICE_ID_KEY]: next })
  return next
}

export async function saveDeviceAuthorization(authorization: ExtensionDeviceAuthorization): Promise<void> {
  const persistent = await loadPersistentState()
  await saveEncryptedDeviceToken(authorization.account.id, authorization.deviceToken)
  await chrome.storage.local.set({
    [PERSISTENT_STATE_KEY]: {
      ...persistent,
      account: {
        id: authorization.account.id,
        displayName: authorization.account.displayName,
        email: authorization.account.email ?? authorization.account.displayName,
        serverUrl: authorization.serverUrl,
        deviceId: authorization.device.id,
        deviceName: authorization.device.name
      }
    } satisfies ExtensionPersistentState
  })
  await saveSessionState(createDefaultSessionState({ connectionStatus: 'online' }))
}

export async function lockExtension(): Promise<void> {
  const state = await loadSessionState()
  await saveSessionState(createDefaultSessionState({
    activeOrigin: state.activeOrigin,
    connectionStatus: state.connectionStatus
  }))
}

export async function credentialMatches(origin: string) {
  const state = await loadSessionState()
  if (!state.unlocked) return { locked: true, matches: [] }
  return {
    locked: false,
    matches: itemsMatchingOrigin(state.items, origin).map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle
    }))
  }
}

export async function loadFillCredential(itemId: string, origin: string): Promise<FillCredentialPayload | null> {
  const state = await loadSessionState()
  if (!state.unlocked) return null
  const item = itemsMatchingOrigin(state.items, origin).find((candidate) => candidate.id === itemId)
  if (!item) return null

  return {
    itemId: item.id,
    title: item.title,
    username: fieldValue(item.fields, ['username', 'email']),
    password: fieldValue(item.fields, ['password', 'secret'])
  }
}

async function loadPersistentState(): Promise<ExtensionPersistentState> {
  const stored = await chrome.storage.local.get(PERSISTENT_STATE_KEY)
  const candidate = stored[PERSISTENT_STATE_KEY] as Partial<ExtensionPersistentState> | undefined
  return {
    schemaVersion: EXTENSION_SCHEMA_VERSION,
    locale: normalizeLocale(candidate?.locale),
    theme: candidate?.theme === 'light' || candidate?.theme === 'dark' ? candidate.theme : 'system',
    account: normalizeAccount(candidate?.account)
  }
}

function normalizeAccount(account: Partial<ExtensionPersistentState['account']> | null | undefined) {
  if (!account?.id || !account.displayName || !account.serverUrl) return null
  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email || account.displayName,
    serverUrl: account.serverUrl,
    deviceId: account.deviceId || '',
    deviceName: account.deviceName || ''
  }
}

async function loadSessionState(): Promise<ExtensionSessionState> {
  const stored = await chrome.storage.session.get(SESSION_STATE_KEY)
  const candidate = stored[SESSION_STATE_KEY] as Partial<ExtensionSessionState> | undefined
  return createDefaultSessionState(candidate)
}

async function saveSessionState(state: ExtensionSessionState): Promise<void> {
  await chrome.storage.session.set({ [SESSION_STATE_KEY]: state })
}

async function hasSiteAccess(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ['http://*/*', 'https://*/*'] })
}

function createDefaultSessionState(input: Partial<ExtensionSessionState> = {}): ExtensionSessionState {
  return {
    unlocked: input.unlocked ?? false,
    activeOrigin: input.activeOrigin ?? '',
    selectedVaultId: input.selectedVaultId ?? 'all',
    selectedItemId: input.selectedItemId ?? null,
    connectionStatus: input.connectionStatus ?? 'offline',
    vaults: input.vaults ?? [],
    items: input.items ?? []
  }
}

function normalizeLocale(locale: unknown): ExtensionLocale {
  if (locale === 'en-US' || locale === 'zh-CN') return locale
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}

function fieldValue(fields: VaultItemField[], kinds: VaultItemField['kind'][]): string {
  for (const field of fields) {
    if (kinds.includes(field.kind) && field.value) return field.value
    const childValue = field.children ? fieldValue(field.children, kinds) : ''
    if (childValue) return childValue
  }
  return ''
}
