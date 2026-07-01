import { configuredOfficialServerUrl } from '@/services/appConfig'
import { vaultItemMatchesSearch } from '@/services/search'
import type { VaultStoreState } from './state'

export const vaultGetters = {
  hasUsers: (state: VaultStoreState) => state.users.length > 0,
  activeUser: (state: VaultStoreState) => {
    return state.users.find((user) => user.id === state.activeUserId) ?? state.users[0] ?? null
  },
  needsUserSetup: (state: VaultStoreState) => {
    const activeUser = state.users.find((user) => user.id === state.activeUserId) ?? state.users[0] ?? null
    return state.users.length === 0 || !activeUser?.crypto
  },
  visibleVaults: (state: VaultStoreState) => state.vaults.filter((vault) => !vault.sync.deletedAt),
  visibleItems: (state: VaultStoreState) => state.items.filter((item) => !item.sync.deletedAt),
  writableVaults: (state: VaultStoreState) => state.vaults.filter((vault) => !vault.sync.deletedAt),
  visibleAttachments: (state: VaultStoreState) => state.attachments.filter((attachment) => !attachment.sync.deletedAt),
  selectedItem: (state: VaultStoreState) => {
    return state.items.find((item) => !item.sync.deletedAt && item.id === state.selectedItemId)
      ?? state.items.find((item) => !item.sync.deletedAt)
      ?? null
  },
  selectedItemAttachments: (state: VaultStoreState) => {
    const item = state.items.find((candidate) => !candidate.sync.deletedAt && candidate.id === state.selectedItemId)
      ?? state.items.find((candidate) => !candidate.sync.deletedAt)
    if (!item) return []
    return state.attachments.filter((attachment) => !attachment.sync.deletedAt && item.attachmentIds.includes(attachment.id))
  },
  filteredItems: (state: VaultStoreState) => {
    return state.items.filter((item) => {
      if (item.sync.deletedAt) return false
      const matchesVault = state.selectedVaultId === 'all' || item.vaultId === state.selectedVaultId
      const matchesType =
        state.selectedType === 'all' ||
        item.type === state.selectedType
      return matchesVault && matchesType && vaultItemMatchesSearch(item, state.query, state.attachments)
    })
  },
  quickResults: (state: VaultStoreState) => {
    return state.items.filter((item) => !item.sync.deletedAt && vaultItemMatchesSearch(item, state.query, state.attachments))
  },
  syncConnected: (state: VaultStoreState) => Boolean(state.settings.sync.deviceId && state.settings.sync.syncSpaceId),
  syncLocalChangeCount: (state: VaultStoreState) => {
    return [...state.vaults, ...state.items, ...state.attachments].filter((object) =>
      object.sync.state === 'dirty' || object.sync.state === 'pending'
    ).length
  },
  syncConflictCount: (state: VaultStoreState) => {
    return [...state.vaults, ...state.items, ...state.attachments].filter((object) => object.sync.state === 'conflicted').length
  },
  syncHostLabel: (state: VaultStoreState) => {
    const serverUrl = state.settings.sync.mode === 'official'
      ? configuredOfficialServerUrl()
      : state.settings.sync.serverUrl
    return serverUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')
  },
  vaultCount: (state: VaultStoreState) => {
    return (vaultId: string | 'all') => {
      if (vaultId === 'all') return Object.values(state.vaultItemCounts).reduce((total, count) => total + count, 0)
      return state.vaultItemCounts[vaultId] ?? 0
    }
  }
}
