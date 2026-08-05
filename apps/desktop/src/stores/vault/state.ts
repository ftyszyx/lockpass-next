import type { Vault, VaultAttachment, VaultItem } from '@lockpass/core'
import type { DesktopVaultPayload } from '@/services/masterPassword'
import { detectBrowserLocale } from '@/services/locale'
import { normalizeShortcutSettings } from '@/services/shortcuts'
import type {
  DesktopUserProfile,
  DesktopVaultStoreData,
  StorageBackend
} from '@/services/vaultRepository'
import {
  DEFAULT_LAYOUT,
  DEFAULT_LOGGING_SETTINGS,
  DEFAULT_SECURITY_SETTINGS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SYNC_SETTINGS
} from './model'
import type { SelectedType } from './types'

export interface VaultStoreState {
  hydrated: boolean
  saving: boolean
  storageBackend: StorageBackend
  storageError: string
  users: DesktopUserProfile[]
  activeUserId: string | null
  unlocked: boolean
  vaultSessionId: string | null
  activeKeyId: string | null
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
  loadedVaultIds: string[]
  vaultItemCounts: Record<string, number>
  selectedVaultId: 'all' | string
  selectedItemId: string | null
  selectedType: SelectedType
  query: string
  settings: DesktopVaultStoreData['settings']
  officialLogin: {
    inProgress: boolean
    exchangeCode: string | null
    lastError: string
  }
  autoSync: {
    running: boolean
    lastError: string
    lastAttemptAt: string | null
  }
  legacyPayloads: Record<string, DesktopVaultPayload>
}

export function createVaultStoreState(): VaultStoreState {
  return {
    hydrated: false,
    saving: false,
    storageBackend: 'browser',
    storageError: '',
    users: [],
    activeUserId: null,
    unlocked: false,
    vaultSessionId: null,
    activeKeyId: null,
    vaults: [],
    items: [],
    attachments: [],
    loadedVaultIds: [],
    vaultItemCounts: {},
    selectedVaultId: 'all',
    selectedItemId: null,
    selectedType: 'all',
    query: '',
    settings: {
      locale: detectBrowserLocale(),
      deviceId: '',
      layout: { ...DEFAULT_LAYOUT },
      logging: { ...DEFAULT_LOGGING_SETTINGS },
      shortcuts: normalizeShortcutSettings(DEFAULT_SHORTCUTS),
      security: { ...DEFAULT_SECURITY_SETTINGS },
      sync: { ...DEFAULT_SYNC_SETTINGS }
    },
    officialLogin: {
      inProgress: false,
      exchangeCode: null,
      lastError: ''
    },
    autoSync: {
      running: false,
      lastError: '',
      lastAttemptAt: null
    },
    legacyPayloads: {}
  }
}
