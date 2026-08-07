import type { Vault, VaultItem, VaultItemField, VaultItemType } from '@lockpass/core'
import type { ExtensionLocale } from '../locales/registry'

export type { ExtensionLocale } from '../locales/registry'

export const EXTENSION_SCHEMA_VERSION = 1 as const

export type ExtensionTheme = 'system' | 'light' | 'dark'
export type ExtensionConnectionStatus = 'offline' | 'online' | 'serverUnavailable'
export type ExtensionServerMode = 'official' | 'selfhost'

export interface ExtensionServerSettings {
  mode: ExtensionServerMode
  selfHostUrl: string
}

export interface ExtensionAccountSummary {
  id: string
  displayName: string
  email: string
  serverUrl: string
  deviceId: string
  deviceName: string
}

export interface ExtensionDeviceAuthorization {
  mode: 'official' | 'selfhost'
  serverUrl: string
  account: {
    id: string
    displayName: string
    email?: string | null
  }
  device: {
    id: string
    clientDeviceId?: string | null
    name: string
    tokenScopes?: string[]
  }
  deviceToken: string
  tokenType: string
}

export interface ExtensionPersistentState {
  schemaVersion: typeof EXTENSION_SCHEMA_VERSION
  locale: ExtensionLocale
  theme: ExtensionTheme
  serverSettings: ExtensionServerSettings
  account: ExtensionAccountSummary | null
}

export interface ExtensionSessionState {
  unlocked: boolean
  activeOrigin: string
  selectedVaultId: 'all' | string
  selectedItemId: string | null
  connectionStatus: ExtensionConnectionStatus
  vaults: Vault[]
  items: VaultItem[]
}

export interface ExtensionPanelState {
  locale: ExtensionLocale
  theme: ExtensionTheme
  serverSettings: ExtensionServerSettings
  account: ExtensionAccountSummary | null
  requiresSecretKey: boolean
  unlocked: boolean
  activeOrigin: string
  selectedVaultId: 'all' | string
  selectedItemId: string | null
  connectionStatus: ExtensionConnectionStatus
  siteAccessEnabled: boolean
  vaults: Vault[]
  items: VaultItem[]
}

export interface ExtensionItemSaveInput {
  editingItemId: string | null
  vaultId: string
  type: VaultItemType
  title: string
  notes: string
  fields: VaultItemField[]
}

export interface CredentialMatchSummary {
  id: string
  title: string
  subtitle: string
}

export interface FillCredentialPayload {
  itemId: string
  title: string
  username: string
  password: string
}
