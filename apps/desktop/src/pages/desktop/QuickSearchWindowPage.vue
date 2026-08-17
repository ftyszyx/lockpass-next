<script setup lang="ts">
import type { VaultItem } from '@lockpass/core'
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { setI18nLocale } from '@/i18n'
import {
  closeDesktopQuickSearchWindow,
  loadDesktopQuickSearchPayload,
  quickSearchItemCopyValue,
  sendDesktopQuickSearchCopy,
  startDesktopQuickSearchPayloadListener,
  type DesktopQuickSearchPayload,
} from '@/services/desktopQuickSearch'
import { applyColorTheme } from '@/services/theme'
import QuickSearchModal from './components/QuickSearchModal.vue'

const payload = shallowRef<DesktopQuickSearchPayload | null>(null)
const query = ref('')
let stopPayloadListener: (() => void) | null = null
let closing = false

onMounted(async () => {
  stopPayloadListener = await startDesktopQuickSearchPayloadListener(reloadPayload)
  await reloadPayload()
})

onUnmounted(() => {
  stopPayloadListener?.()
  stopPayloadListener = null
})

async function reloadPayload(): Promise<void> {
  const nextPayload = await loadDesktopQuickSearchPayload()
  if (!nextPayload) {
    await closeWindow()
    return
  }

  payload.value = nextPayload
  query.value = nextPayload.query
  setI18nLocale(nextPayload.locale)
  applyColorTheme(nextPayload.theme)
}

async function copyItemAndClose(item: VaultItem): Promise<void> {
  await copyAndClose(quickSearchItemCopyValue(item), item.id, 'copiedPassword')
}

async function copyFieldAndClose(value: string, item: VaultItem): Promise<void> {
  await copyAndClose(value, item.id, 'copied')
}

async function copyAndClose(
  value: string,
  itemId: string,
  message: 'copied' | 'copiedPassword',
): Promise<void> {
  if (closing) return
  closing = true
  try {
    await navigator.clipboard?.writeText(value)
  } catch {
    // The main window also receives the value and can perform the clipboard write.
  }
  try {
    await sendDesktopQuickSearchCopy({ value, itemId, message })
  } catch {
    // Copy already succeeded locally when cross-window delivery is unavailable.
  } finally {
    await closeDesktopQuickSearchWindow()
  }
}

async function closeWindow(): Promise<void> {
  if (closing) return
  closing = true
  await closeDesktopQuickSearchWindow()
}
</script>

<template>
  <main class="h-screen overflow-hidden bg-[var(--app-surface)]">
    <QuickSearchModal
      v-if="payload"
      standalone
      :query="query"
      :items="payload.items"
      :attachments="payload.attachments"
      @update:query="query = $event"
      @close="closeWindow"
      @select-and-copy="copyItemAndClose"
      @copy-value="copyFieldAndClose"
    />
  </main>
</template>
