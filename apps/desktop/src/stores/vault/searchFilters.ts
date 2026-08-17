import type { VaultAttachment, VaultItem } from '@lockpass/core'
import { vaultItemMatchesSearch } from '@/services/search'
import type { SelectedType } from './types'

export interface VaultListFilters {
  selectedVaultId: string | 'all'
  selectedType: SelectedType
  query: string
}

export function vaultItemMatchesListFilters(
  item: VaultItem,
  attachments: VaultAttachment[],
  filters: VaultListFilters
): boolean {
  if (item.sync.deletedAt) return false

  const hasSearchQuery = filters.query.trim().length > 0
  const matchesVault = hasSearchQuery
    || filters.selectedVaultId === 'all'
    || item.vaultId === filters.selectedVaultId
  const matchesType = filters.selectedType === 'all' || item.type === filters.selectedType

  return matchesVault
    && matchesType
    && vaultItemMatchesSearch(item, filters.query, attachments)
}
