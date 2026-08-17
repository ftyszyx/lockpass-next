<script setup lang="ts">
import type { VaultItem } from '@lockpass/core'
import { Paperclip, Star } from '@lucide/vue'
import { vaultItemIconText } from './vaultFormatters'

const props = defineProps<{
  item: VaultItem
  typeLabel: string
  contextLabel?: string
  selected?: boolean
}>()

const emit = defineEmits<{
  select: [item: VaultItem]
}>()
</script>

<template>
  <button
    class="lp-vault-item-row"
    :class="{ 'lp-vault-item-row-active': selected }"
    type="button"
    @click="emit('select', item)"
  >
    <span class="lp-vault-item-icon">{{ vaultItemIconText(item) }}</span>
    <span class="lp-vault-item-copy">
      <strong>{{ item.title }}</strong>
      <small :title="contextLabel || undefined">
        {{ item.subtitle || typeLabel }}<template v-if="contextLabel"> · {{ contextLabel }}</template>
      </small>
    </span>
    <span class="lp-vault-item-actions">
      <span v-if="item.attachmentIds.length" class="lp-vault-item-attachment">
        <Paperclip class="lp-vault-item-action-icon" />
        {{ item.attachmentIds.length }}
      </span>
      <Star v-if="item.favorite" class="lp-vault-item-favorite" />
    </span>
  </button>
</template>
