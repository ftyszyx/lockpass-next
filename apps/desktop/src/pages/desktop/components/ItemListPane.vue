<script setup lang="ts">
import {
  ArrowDownUp,
  Check,
  ChevronDown,
  CreditCard,
  FolderLock,
  Grid2X2,
  KeyRound,
  Plus,
  Search,
  StickyNote,
  Upload,
} from '@lucide/vue'
import type { VaultItem } from '@lockpass/core'
import { VaultItemRow } from '@lockpass/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useVaultStore } from '@/stores/vault'
import type { SelectedType } from '@/stores/vault/types'
import { typeLabel } from '../formatters'
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

function vaultContextLabel(item: VaultItem): string {
  if (!vaultStore.query.trim()) return ''
  const vault = vaultStore.visibleVaults.find((candidate) => candidate.id === item.vaultId)
  return vault ? t('list.vaultContext', { name: vault.name }) : ''
}

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
  <section class="app-list-panel flex min-h-0 flex-col border-r">
    <div class="item-list-header border-b px-3 py-2.5">
      <div class="mb-2 flex items-center justify-between">
        <strong class="text-[15px]">{{ t('list.title') }}</strong>
        <span class="text-xs font-bold text-[var(--app-muted)]">{{ t('list.count', { count: items.length }) }}</span>
      </div>
      <div class="flex items-center justify-between gap-2">
        <div ref="categoryDropdown" class="relative">
          <button
            class="plain-button font-semibold"
            type="button"
            :aria-expanded="categoryMenuOpen"
            aria-haspopup="menu"
            @click.stop="categoryMenuOpen = !categoryMenuOpen"
          >
            <component :is="typeIcon(vaultStore.selectedType)" class="size-4 text-[var(--app-primary-text)]" />
            <span>{{ typeLabel(t, vaultStore.selectedType) }}</span>
            <ChevronDown class="size-4 text-slate-500" />
          </button>

          <div
            v-if="categoryMenuOpen"
            class="floating-panel absolute left-0 top-10 z-20 w-52 overflow-hidden rounded-lg border py-1"
            role="menu"
          >
            <button
              v-for="type in typeFilters"
              :key="type"
              class="menu-item grid-cols-[22px_minmax(0,1fr)_18px] px-3 font-semibold"
              :class="{ 'bg-[var(--app-primary-soft)] text-[var(--app-primary-text)]': vaultStore.selectedType === type }"
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

    <div v-else-if="items.length === 0" class="grid flex-1 place-items-center p-6 text-center">
      <div class="grid max-w-[260px] gap-2.5">
        <span class="mx-auto grid size-10 place-items-center rounded-md bg-[var(--app-tabs)] text-[var(--app-muted)]">
          <FolderLock class="size-4" />
        </span>
        <strong class="text-[15px]">{{ hasItems ? t('list.noMatchesTitle') : t('list.emptyTitle') }}</strong>
        <p class="text-sm leading-5 text-[var(--app-muted)]">{{ hasItems ? t('list.noMatchesBody') : t('list.emptyBody') }}</p>
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

    <div v-else class="grid min-h-0 flex-1 content-start gap-1 overflow-auto p-1.5">
      <VaultItemRow
        v-for="item in sortedItems"
        :key="item.id"
        :item="item"
        :selected="selectedItem?.id === item.id"
        :type-label="typeLabel(t, item.type)"
        :context-label="vaultContextLabel(item)"
        @select="emit('selectItem', $event)"
      />
    </div>
  </section>
</template>
