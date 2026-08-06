<script setup lang="ts">
import type { Vault, VaultItem } from '@lockpass/core'
import { FolderLock, LayoutGrid } from '@lucide/vue'
import { VaultAccountSummary } from '@lockpass/ui'
import { useI18n } from 'vue-i18n'
import SiteAccessBar from './SiteAccessBar.vue'

const props = defineProps<{
  accountName: string
  accountInitials: string
  statusLabel: string
  statusTone: 'normal' | 'warning'
  vaults: Vault[]
  items: VaultItem[]
  selectedVaultId: 'all' | string
  siteAccessEnabled: boolean
  siteAccessBusy: boolean
}>()

const emit = defineEmits<{
  selectVault: [vaultId: 'all' | string]
  enableSiteAccess: []
}>()

const { t } = useI18n()

function vaultItemCount(vaultId: string): number {
  return props.items.filter((item) => item.vaultId === vaultId).length
}
</script>

<template>
  <aside class="extension-sidebar">
    <div class="extension-sidebar-account">
      <VaultAccountSummary
        :name="accountName"
        :initials="accountInitials"
        :status-label="statusLabel"
        :status-tone="statusTone"
      />
    </div>

    <nav class="extension-vault-nav">
      <div class="extension-vault-nav-title">{{ t('app.vaults') }}</div>
      <button
        class="extension-vault-nav-item"
        :class="{ active: selectedVaultId === 'all' }"
        type="button"
        @click="emit('selectVault', 'all')"
      >
        <LayoutGrid />
        <span>{{ t('app.allItems') }}</span>
        <small>{{ items.length }}</small>
      </button>
      <button
        v-for="vault in vaults"
        :key="vault.id"
        class="extension-vault-nav-item"
        :class="{ active: selectedVaultId === vault.id }"
        type="button"
        @click="emit('selectVault', vault.id)"
      >
        <FolderLock />
        <span>{{ vault.name }}</span>
        <small>{{ vaultItemCount(vault.id) }}</small>
      </button>
    </nav>

    <SiteAccessBar
      class="extension-sidebar-site-access"
      :enabled="siteAccessEnabled"
      :busy="siteAccessBusy"
      @enable="emit('enableSiteAccess')"
    />
  </aside>
</template>
