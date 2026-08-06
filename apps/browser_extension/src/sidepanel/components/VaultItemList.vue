<script setup lang="ts">
import type { VaultItem, VaultItemType } from '@lockpass/core'
import { KeyRound } from '@lucide/vue'
import { VaultItemRow } from '@lockpass/ui'
import { useI18n } from 'vue-i18n'

defineProps<{
  items: VaultItem[]
  selectedItemId: string | null
}>()

const emit = defineEmits<{
  selectItem: [itemId: string]
}>()

const { t } = useI18n()

function typeLabel(type: VaultItemType): string {
  const keys: Record<VaultItemType, string> = {
    login: 'type.login',
    'secure-note': 'type.secureNote',
    'payment-card': 'type.paymentCard',
    attachment: 'type.attachment',
    identity: 'type.identity',
    'recovery-code': 'type.recoveryCode'
  }
  return t(keys[type])
}

</script>

<template>
  <section class="extension-item-list-pane">
    <header class="extension-pane-header">
      <strong>{{ t('app.items') }}</strong>
      <span>{{ t('app.itemsCount', { count: items.length }) }}</span>
    </header>

    <div v-if="items.length" class="item-list">
      <VaultItemRow
        v-for="item in items"
        :key="item.id"
        :item="item"
        :selected="selectedItemId === item.id"
        :type-label="typeLabel(item.type)"
        @select="emit('selectItem', $event.id)"
      />
    </div>

    <div v-else class="empty-state">
      <KeyRound class="size-5" />
      <strong>{{ t('app.emptyTitle') }}</strong>
      <span>{{ t('app.emptyBody') }}</span>
    </div>
  </section>
</template>
