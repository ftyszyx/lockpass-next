<script setup lang="ts">
import { ChevronRight, Copy, Search } from '@lucide/vue'
import type { VaultAttachment, VaultItem } from '@lockpass/core'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { vaultItemMatchesSearch } from '@/services/search'
import { itemIconText } from '../formatters'
import QuickSearchItemDetail from './QuickSearchItemDetail.vue'
import {
  moveQuickSearchSelection,
  retainQuickSearchSelection,
} from './quickSearchNavigation'

const props = defineProps<{
  items: VaultItem[]
  attachments: VaultAttachment[]
  query: string
  standalone?: boolean
}>()

const emit = defineEmits<{
  close: []
  'update:query': [value: string]
  selectAndCopy: [item: VaultItem]
  copyValue: [value: string, item: VaultItem]
}>()

const { t } = useI18n()
const localQuery = ref(props.query)
const activeView = ref<'results' | 'details'>('results')
const selectedItemId = ref<string | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const detailView = ref<InstanceType<typeof QuickSearchItemDetail> | null>(null)
const resultElements = new Map<string, HTMLElement>()

watch(
  () => props.query,
  (value) => {
    if (value !== localQuery.value) localQuery.value = value
  }
)

const queryModel = computed({
  get: () => localQuery.value,
  set: (value: string) => {
    localQuery.value = value
    emit('update:query', value)
  }
})

const filteredItems = computed(() =>
  props.items.filter((item) =>
    vaultItemMatchesSearch(item, localQuery.value, props.attachments),
  ),
)
const selectedItem = computed(
  () =>
    filteredItems.value.find((item) => item.id === selectedItemId.value) ??
    null,
)
const selectedItemAttachments = computed(() =>
  selectedItem.value
    ? props.attachments.filter(
        (attachment) => attachment.itemId === selectedItem.value?.id,
      )
    : [],
)

watch(
  filteredItems,
  (items) => {
    selectedItemId.value = retainQuickSearchSelection(
      selectedItemId.value,
      items.map((item) => item.id),
    )
    scrollSelectedIntoView()
  },
  { immediate: true },
)

function setResultElement(itemId: string, element: unknown): void {
  if (element instanceof HTMLElement) {
    resultElements.set(itemId, element)
    return
  }
  resultElements.delete(itemId)
}

function scrollSelectedIntoView(): void {
  const itemId = selectedItemId.value
  if (!itemId) return
  void nextTick(() => {
    resultElements.get(itemId)?.scrollIntoView({ block: 'nearest' })
  })
}

function moveSelection(delta: -1 | 1): void {
  const currentIndex = filteredItems.value.findIndex(
    (item) => item.id === selectedItemId.value,
  )
  const nextIndex = moveQuickSearchSelection(
    currentIndex,
    filteredItems.value.length,
    delta,
  )
  selectedItemId.value = filteredItems.value[nextIndex]?.id ?? null
  scrollSelectedIntoView()
}

function selectItem(item: VaultItem): void {
  selectedItemId.value = item.id
}

function copySelectedItem(): void {
  if (selectedItem.value) emit('selectAndCopy', selectedItem.value)
}

function copySelectedField(value: string): void {
  if (selectedItem.value) emit('copyValue', value, selectedItem.value)
}

function openSelectedItem(): void {
  if (!selectedItem.value) return
  activeView.value = 'details'
}

function openItem(item: VaultItem): void {
  selectItem(item)
  activeView.value = 'details'
}

function returnToResults(): void {
  activeView.value = 'results'
  void nextTick(() => searchInput.value?.focus())
}

function onKeydown(event: KeyboardEvent): void {
  if (activeView.value === 'details') {
    if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      returnToResults()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      detailView.value?.moveSelection(event.key === 'ArrowDown' ? 1 : -1)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      detailView.value?.copySelectedRow()
    }
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('close')
    return
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    moveSelection(event.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    event.stopPropagation()
    openSelectedItem()
    return
  }

  if (event.key !== 'Enter') return
  event.preventDefault()
  event.stopPropagation()
  copySelectedItem()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div
    :class="standalone
      ? 'h-screen bg-[var(--app-surface-muted)] p-3'
      : 'fixed inset-0 z-50 bg-slate-950/40 pt-[9vh]'"
  >
    <button
      v-if="!standalone"
      class="absolute inset-0"
      :aria-label="t('quick.close')"
      @click="emit('close')"
    ></button>
    <section
      class="relative overflow-hidden bg-[var(--app-surface)]"
      :class="standalone
        ? 'flex h-full w-full flex-col rounded-lg border border-[var(--app-border)] shadow-sm'
        : 'mx-auto w-[680px] max-w-[94vw] rounded-lg border border-slate-200 shadow-2xl'"
    >
      <div v-if="activeView === 'results'" class="flex min-h-0 flex-1 flex-col">
        <label class="relative block shrink-0 border-b border-[var(--app-border)] p-3">
          <Search class="absolute left-7 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
          <input
            ref="searchInput"
            v-model="queryModel"
            class="h-11 w-full rounded-md border border-[var(--app-field-border)] bg-[var(--app-field-bg)] pl-10 pr-3 text-[var(--app-text)] outline-none focus:border-teal-700"
            :placeholder="t('quick.placeholder')"
            autofocus
          />
        </label>
        <div
          class="min-h-0 overflow-auto p-2"
          :class="standalone ? 'flex-1' : 'max-h-[410px]'"
          role="listbox"
          :aria-label="t('quick.results')"
        >
          <div v-if="!filteredItems.length" class="p-6 text-center text-sm text-slate-500">
            {{ t('quick.empty') }}
          </div>
          <div
            v-for="item in filteredItems"
            :key="item.id"
            :ref="(element) => setResultElement(item.id, element)"
            class="flex min-h-16 w-full items-center gap-1 rounded-md border border-transparent px-1 transition-colors hover:bg-teal-50"
            :class="selectedItemId === item.id ? 'bg-teal-50 ring-1 ring-inset ring-teal-200' : ''"
            role="option"
            :aria-selected="selectedItemId === item.id"
            @mouseenter="selectItem(item)"
          >
            <button
              class="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md p-2 text-left"
              type="button"
              :title="t('quick.viewDetails')"
              @click="openItem(item)"
            >
              <span class="grid size-10 place-items-center rounded-lg bg-[var(--app-surface-muted)] text-[11px] font-bold text-[var(--app-text)]">
                {{ itemIconText(item) }}
              </span>
              <span class="min-w-0">
                <strong class="block truncate">{{ item.title }}</strong>
                <small class="block truncate text-slate-500">{{ item.subtitle }}</small>
              </span>
            </button>
            <span class="flex w-[72px] shrink-0 items-center justify-end gap-1 pr-1">
              <button
                class="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-muted)] hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                type="button"
                :title="t('quick.copy')"
                :aria-label="t('quick.copy')"
                @click="emit('selectAndCopy', item)"
              >
                <Copy class="size-4" />
              </button>
              <button
                class="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-muted)] hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                type="button"
                :title="t('quick.viewDetails')"
                :aria-label="t('quick.viewDetails')"
                @click="openItem(item)"
              >
                <ChevronRight class="size-4" />
              </button>
            </span>
          </div>
        </div>
      </div>

      <QuickSearchItemDetail
        v-else-if="selectedItem"
        ref="detailView"
        :fill="standalone"
        :item="selectedItem"
        :attachments="selectedItemAttachments"
        @back="returnToResults"
        @copy-value="copySelectedField"
      />
    </section>
  </div>
</template>
