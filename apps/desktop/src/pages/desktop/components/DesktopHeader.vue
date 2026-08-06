<script setup lang="ts">
import { Command, ExternalLink, Lock, Plus, WandSparkles } from '@lucide/vue'
import { VaultSearchInput } from '@lockpass/ui'
import { useI18n } from 'vue-i18n'
import { isUserWebRuntime } from '@/services/runtime'
import { useVaultStore } from '@/stores/vault'

const emit = defineEmits<{
  quickSearch: []
  openGenerator: []
  openWebApp: []
  newItem: []
  lock: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const webRuntime = isUserWebRuntime()
</script>

<template>
  <header class="app-header grid min-h-[52px] grid-cols-[minmax(260px,480px)_1fr] items-center gap-3 border-b px-3.5">
    <VaultSearchInput
      v-model="vaultStore.query"
      :placeholder="t('app.searchPlaceholder')"
    />

    <div class="flex items-center justify-end gap-1">
      <button class="icon-button" :title="t('app.quickSearch')" @click="emit('quickSearch')">
        <Command class="size-4" />
      </button>
      <button class="icon-button" :title="t('app.generator')" @click="emit('openGenerator')">
        <WandSparkles class="size-4" />
      </button>
      <button
        v-if="!webRuntime"
        class="plain-button ml-1"
        type="button"
        :title="t('app.openWebAppHint')"
        :aria-label="t('app.openWebAppHint')"
        @click="emit('openWebApp')"
      >
        <ExternalLink class="size-4" />
        {{ t('app.openWebApp') }}
      </button>
      <button class="primary-button px-3.5" @click="emit('newItem')">
        <Plus class="size-4" />
        {{ t('app.newItem') }}
      </button>
      <button class="icon-button" :title="t('app.lock')" @click="emit('lock')">
        <Lock class="size-4" />
      </button>
    </div>
  </header>
</template>
