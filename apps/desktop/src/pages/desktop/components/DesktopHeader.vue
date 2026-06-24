<script setup lang="ts">
import { Command, Lock, Plus, Search, WandSparkles } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'

const emit = defineEmits<{
  quickSearch: []
  openGenerator: []
  newItem: []
  lock: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
</script>

<template>
  <header class="grid min-h-14 grid-cols-[minmax(260px,520px)_1fr] items-center gap-4 border-b border-slate-200 bg-white px-4">
    <label class="relative block">
      <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        v-model="vaultStore.query"
        class="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 outline-none focus:border-teal-700 focus:bg-white focus:ring-4 focus:ring-teal-700/10"
        :placeholder="t('app.searchPlaceholder')"
        type="search"
      />
    </label>

    <div class="flex items-center justify-end gap-1">
      <button class="icon-button" :title="t('app.quickSearch')" @click="emit('quickSearch')">
        <Command class="size-4" />
      </button>
      <button class="icon-button" :title="t('app.generator')" @click="emit('openGenerator')">
        <WandSparkles class="size-4" />
      </button>
      <button class="primary-button ml-2 px-4" @click="emit('newItem')">
        <Plus class="size-4" />
        {{ t('app.newItem') }}
      </button>
      <button class="icon-button" :title="t('app.lock')" @click="emit('lock')">
        <Lock class="size-4" />
      </button>
    </div>
  </header>
</template>
