<script setup lang="ts">
import { Search } from '@lucide/vue'
import type { VaultAttachment, VaultItem } from '@lockpass/core'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { vaultItemMatchesSearch } from '@/services/search'
import { itemIconText } from '../formatters'

const props = defineProps<{
  items: VaultItem[]
  attachments: VaultAttachment[]
  query: string
}>()

const emit = defineEmits<{
  close: []
  'update:query': [value: string]
  selectAndCopy: [item: VaultItem]
}>()

const { t } = useI18n()
const localQuery = ref(props.query)

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

const filteredItems = computed(() => props.items.filter((item) => vaultItemMatchesSearch(item, localQuery.value, props.attachments)))

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<template>
  <div class="fixed inset-0 z-50 bg-slate-950/40 pt-[9vh]">
    <button class="absolute inset-0" aria-label="Close" @click="emit('close')"></button>
    <section class="relative mx-auto w-[680px] max-w-[94vw] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
      <label class="relative block border-b border-slate-200 p-4">
        <Search class="absolute left-7 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
        <input
          v-model="queryModel"
          class="h-11 w-full rounded-lg border border-slate-200 pl-10 outline-none focus:border-teal-700"
          :placeholder="t('quick.placeholder')"
          autofocus
        />
      </label>
      <div class="max-h-[410px] overflow-auto p-2">
        <div v-if="!filteredItems.length" class="p-6 text-center text-sm text-slate-500">{{ t('quick.empty') }}</div>
        <button
          v-for="item in filteredItems"
          :key="item.id"
          class="grid min-h-14 w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-2 text-left hover:bg-teal-50"
          @click="emit('selectAndCopy', item)"
        >
          <span class="grid size-10 place-items-center rounded-lg bg-[var(--app-surface-muted)] text-[11px] font-bold text-[var(--app-text)]">{{ itemIconText(item) }}</span>
          <span class="min-w-0">
            <strong class="block truncate">{{ item.title }}</strong>
            <small class="block truncate text-slate-500">{{ item.subtitle }}</small>
          </span>
          <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{{ t('quick.copy') }}</span>
        </button>
      </div>
    </section>
  </div>
</template>
