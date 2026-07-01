<script setup lang="ts">
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  CreditCard,
  FolderLock,
  Grid2X2,
  KeyRound,
  Paperclip,
  Plus,
  Search,
  StickyNote,
  Upload,
} from '@lucide/vue'
import type { VaultItem } from '@lockpass/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'
import type { SelectedType } from '@/stores/vault'
import { itemIconText, typeLabel } from '../formatters'
import { typeFilters } from '../types'

const props = defineProps<{
  items: VaultItem[]
  selectedItem: VaultItem | null
  hasItems: boolean
}>()

const emit = defineEmits<{
  selectItem: [item: VaultItem]
  createItem: []
  importCsv: []
  quickSearch: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const categoryMenuOpen = ref(false)
const categoryDropdown = ref<HTMLElement | null>(null)
const sortNewestFirst = ref(true)

const sortedItems = computed(() => {
  return [...props.items].sort((a, b) => {
    const diff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    return sortNewestFirst.value ? diff : -diff
  })
})

function selectType(type: (typeof typeFilters)[number]): void {
  vaultStore.selectedType = type
  categoryMenuOpen.value = false
}

function typeIcon(type: SelectedType) {
  if (type === 'login') return KeyRound
  if (type === 'payment-card') return CreditCard
  if (type === 'secure-note') return StickyNote
  return Grid2X2
}

function onDocumentClick(event: MouseEvent): void {
  if (!categoryDropdown.value?.contains(event.target as Node)) {
    categoryMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
</script>

<template>
  <section class="flex min-h-0 flex-col border-r border-slate-200 bg-white">
    <div class="border-b border-slate-200 px-4 py-3">
      <div class="mb-3 flex items-center justify-between">
        <strong class="text-[15px]">{{ t('list.title') }}</strong>
        <span class="text-xs font-bold text-slate-500">{{ t('list.count', { count: items.length }) }}</span>
      </div>
      <div class="flex items-center justify-between gap-2">
        <div ref="categoryDropdown" class="relative">
          <button
            class="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:border-slate-300"
            type="button"
            :aria-expanded="categoryMenuOpen"
            aria-haspopup="menu"
            @click.stop="categoryMenuOpen = !categoryMenuOpen"
          >
            <component :is="typeIcon(vaultStore.selectedType)" class="size-4 text-teal-700" />
            <span>{{ typeLabel(t, vaultStore.selectedType) }}</span>
            <ChevronDown class="size-4 text-slate-500" />
          </button>

          <div
            v-if="categoryMenuOpen"
            class="absolute left-0 top-10 z-20 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
            role="menu"
          >
            <button
              v-for="type in typeFilters"
              :key="type"
              class="grid min-h-9 w-full grid-cols-[22px_minmax(0,1fr)_18px] items-center gap-2 px-3 text-left text-sm font-semibold hover:bg-slate-50"
              :class="{ 'bg-teal-50 text-teal-900': vaultStore.selectedType === type }"
              type="button"
              role="menuitem"
              @click="selectType(type)"
            >
              <component :is="typeIcon(type)" class="size-4" />
              <span>{{ typeLabel(t, type) }}</span>
              <Check v-if="vaultStore.selectedType === type" class="size-4" />
            </button>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <button class="icon-button" type="button" :title="t('app.quickSearch')" @click="emit('quickSearch')">
            <Search class="size-4" />
          </button>
          <button
            class="icon-button"
            type="button"
            :title="sortNewestFirst ? t('list.sortNewestFirst') : t('list.sortOldestFirst')"
            @click="sortNewestFirst = !sortNewestFirst"
          >
            <ArrowDownUp class="size-4" />
          </button>
        </div>
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
        v-for="item in sortedItems"
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
