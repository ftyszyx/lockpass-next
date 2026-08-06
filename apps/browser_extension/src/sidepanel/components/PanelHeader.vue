<script setup lang="ts">
import { Lock, Plus } from '@lucide/vue'
import { VaultSearchInput } from '@lockpass/ui'
import { useI18n } from 'vue-i18n'
import brandIconUrl from '../../../../desktop/src-tauri/icons/icon.png'

defineProps<{
  searchEnabled: boolean
  createEnabled: boolean
  query: string
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  create: []
  lock: []
}>()

const { t } = useI18n()
</script>

<template>
  <header class="panel-header">
    <div class="brand-lockup">
      <img class="brand-icon" :src="brandIconUrl" alt="" />
      <span v-if="!searchEnabled" class="brand-copy">
        <strong>{{ t('app.title') }}</strong>
        <small>{{ t('app.subtitle') }}</small>
      </span>
    </div>
    <VaultSearchInput
      v-if="searchEnabled"
      class="panel-search"
      :model-value="query"
      :placeholder="t('app.search')"
      @update:model-value="emit('update:query', $event)"
    />
    <div v-if="searchEnabled" class="header-actions">
      <button class="primary-button" type="button" :disabled="!createEnabled" @click="emit('create')">
        <Plus />
        {{ t('app.newItem') }}
      </button>
      <button class="icon-button" type="button" :title="t('app.lock')" @click="emit('lock')">
        <Lock />
      </button>
    </div>
  </header>
</template>
