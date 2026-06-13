<script setup lang="ts">
import { FolderLock, Paperclip, Plus, Upload } from '@lucide/vue'
import type { VaultItem } from '@lockpass/core'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'
import { itemIconText, typeLabel } from '../formatters'
import { typeFilters } from '../types'

defineProps<{
  items: VaultItem[]
  selectedItem: VaultItem | null
  hasItems: boolean
}>()

const emit = defineEmits<{
  selectItem: [item: VaultItem]
  createItem: []
  importCsv: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
</script>

<template>
  <section class="flex min-h-0 flex-col border-r border-slate-200 bg-white">
    <div class="border-b border-slate-200 px-4 py-3">
      <div class="mb-3 flex items-center justify-between">
        <strong class="text-[15px]">{{ t('list.title') }}</strong>
        <span class="text-xs font-bold text-slate-500">{{ t('list.count', { count: items.length }) }}</span>
      </div>
      <div class="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
        <button
          v-for="type in typeFilters"
          :key="type"
          class="h-8 shrink-0 rounded-md px-2 text-sm font-semibold text-slate-600 hover:bg-white hover:text-slate-950"
          :class="{ 'bg-white text-teal-800 shadow-sm': vaultStore.selectedType === type }"
          @click="vaultStore.selectedType = type"
        >
          {{ typeLabel(t, type) }}
        </button>
      </div>
    </div>

    <div v-if="!vaultStore.hydrated" class="grid flex-1 place-items-center p-6 text-center text-slate-500">
      {{ t('app.loading') }}
    </div>

    <div v-else-if="items.length === 0" class="grid flex-1 place-items-center p-8 text-center">
      <div class="grid max-w-[260px] gap-3">
        <span class="mx-auto grid size-11 place-items-center rounded-lg bg-slate-100 text-slate-500">
          <FolderLock class="size-4" />
        </span>
        <strong class="text-[15px]">{{ hasItems ? t('list.noMatchesTitle') : t('list.emptyTitle') }}</strong>
        <p class="text-sm leading-6 text-slate-500">{{ hasItems ? t('list.noMatchesBody') : t('list.emptyBody') }}</p>
        <button class="primary-button justify-self-center" @click="emit('createItem')">
          <Plus class="size-4" />
          {{ hasItems ? t('app.newItem') : t('list.createFirst') }}
        </button>
        <button v-if="!hasItems" class="plain-button justify-self-center" @click="emit('importCsv')">
          <Upload class="size-4" />
          {{ t('list.importBrowserCsv') }}
        </button>
      </div>
    </div>

    <div v-else class="min-h-0 flex-1 overflow-auto p-2">
      <button
        v-for="item in items"
        :key="item.id"
        class="grid min-h-[64px] w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
        :class="{ 'bg-teal-50 ring-1 ring-teal-100': selectedItem?.id === item.id }"
        @click="emit('selectItem', item)"
      >
        <span class="grid size-9 place-items-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-700">{{ itemIconText(item) }}</span>
        <span class="min-w-0">
          <strong class="block truncate text-sm">{{ item.title }}</strong>
          <small class="block truncate text-slate-500">{{ item.subtitle || typeLabel(t, item.type) }}</small>
        </span>
        <span v-if="item.attachmentIds.length" class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
          <Paperclip class="size-3" />
          {{ item.attachmentIds.length }}
        </span>
      </button>
    </div>
  </section>
</template>
