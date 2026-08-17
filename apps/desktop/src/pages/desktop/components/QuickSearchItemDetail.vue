<script setup lang="ts">
import { ArrowLeft, Eye, EyeOff, Paperclip } from '@lucide/vue'
import type { VaultAttachment, VaultItem } from '@lockpass/core'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { fieldsWithoutRedundantLegacyNote } from '@/services/legacyImportRepair'
import {
  detailFields,
  displayValue,
  fieldLabel,
  formatFileSize,
  typeLabel,
} from '../formatters'
import {
  moveQuickSearchSelection,
  retainQuickSearchSelection,
} from './quickSearchNavigation'

const props = defineProps<{
  item: VaultItem
  attachments: VaultAttachment[]
  fill?: boolean
}>()

const emit = defineEmits<{
  back: []
  copyValue: [value: string]
}>()

const { t } = useI18n()
const showSensitive = ref(false)
const selectedRowId = ref<string | null>(null)
const rowElements = new Map<string, HTMLElement>()
const visibleFields = computed(() => detailFields(t, props.item))
const notesText = computed(() => props.item.notes || '')
const noteFields = computed(() =>
  fieldsWithoutRedundantLegacyNote(props.item).filter(
    (field) => field.kind === 'note',
  ),
)
const copyableRows = computed(() => {
  const rows: Array<{ id: string; value: string }> = []

  for (const field of visibleFields.value) {
    if (field.kind === 'group') {
      for (const child of field.children ?? []) {
        rows.push({ id: fieldRowId(child.id), value: child.value })
      }
    } else {
      rows.push({ id: fieldRowId(field.id), value: field.value })
    }
  }

  if (notesText.value) {
    rows.push({ id: 'item-notes', value: notesText.value })
  }
  for (const field of noteFields.value) {
    rows.push({ id: fieldRowId(field.id), value: field.value })
  }
  for (const attachment of props.attachments) {
    rows.push({ id: attachmentRowId(attachment.id), value: attachment.fileName })
  }

  return rows
})

watch(
  copyableRows,
  (rows) => {
    selectedRowId.value = retainQuickSearchSelection(
      selectedRowId.value,
      rows.map((row) => row.id),
    )
    scrollSelectedRowIntoView()
  },
  { immediate: true },
)

function fieldRowId(fieldId: string): string {
  return `field-${fieldId}`
}

function attachmentRowId(attachmentId: string): string {
  return `attachment-${attachmentId}`
}

function setRowElement(rowId: string, element: unknown): void {
  if (element instanceof HTMLElement) {
    rowElements.set(rowId, element)
    return
  }
  rowElements.delete(rowId)
}

function selectRow(rowId: string): void {
  selectedRowId.value = rowId
}

function selectedRowClass(rowId: string): string {
  return selectedRowId.value === rowId
    ? 'bg-teal-50 ring-1 ring-inset ring-teal-200'
    : ''
}

function scrollSelectedRowIntoView(): void {
  const rowId = selectedRowId.value
  if (!rowId) return
  void nextTick(() => {
    rowElements.get(rowId)?.scrollIntoView({ block: 'nearest' })
  })
}

function moveSelection(delta: -1 | 1): void {
  const currentIndex = copyableRows.value.findIndex(
    (row) => row.id === selectedRowId.value,
  )
  const nextIndex = moveQuickSearchSelection(
    currentIndex,
    copyableRows.value.length,
    delta,
  )
  selectedRowId.value = copyableRows.value[nextIndex]?.id ?? null
  scrollSelectedRowIntoView()
}

function copySelectedRow(): void {
  const row = copyableRows.value.find((item) => item.id === selectedRowId.value)
  if (row) emit('copyValue', row.value)
}

defineExpose({
  copySelectedRow,
  moveSelection,
})
</script>

<template>
  <div
    class="flex min-h-[260px] flex-col"
    :class="fill ? 'h-full min-h-0 flex-1' : 'max-h-[520px]'"
  >
    <header class="flex items-start gap-3 border-b border-[var(--app-border)] p-4">
      <button
        class="icon-button mt-0.5 shrink-0"
        type="button"
        :title="t('quick.back')"
        @click="emit('back')"
      >
        <ArrowLeft class="size-4" />
      </button>
      <div class="min-w-0 flex-1">
        <span class="text-xs font-semibold text-[var(--app-muted)]">
          {{ typeLabel(t, item.type) }}
        </span>
        <h2 class="truncate text-lg font-bold text-[var(--app-text)]">
          {{ item.title }}
        </h2>
        <p v-if="item.subtitle" class="truncate text-sm text-[var(--app-muted)]">
          {{ item.subtitle }}
        </p>
      </div>
      <button
        class="icon-button shrink-0"
        type="button"
        :title="showSensitive ? t('detail.hideSensitive') : t('detail.showSensitive')"
        @click="showSensitive = !showSensitive"
      >
        <EyeOff v-if="showSensitive" class="size-4" />
        <Eye v-else class="size-4" />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-auto p-4">
      <div
        v-if="visibleFields.length || notesText || noteFields.length"
        class="detail-surface overflow-hidden rounded-md border"
      >
        <div
          v-for="field in visibleFields"
          :key="field.id"
          class="detail-field-row border-b last:border-b-0"
        >
          <div
            v-if="field.kind === 'group'"
            class="grid gap-2 bg-[var(--app-surface-muted)] px-3 py-2.5"
          >
            <span class="detail-label text-sm font-semibold">
              {{ fieldLabel(t, field.kind, field.label) }}
            </span>
            <div
              v-for="child in field.children ?? []"
              :key="child.id"
              :ref="(element) => setRowElement(fieldRowId(child.id), element)"
              class="grid grid-cols-[116px_minmax(0,1fr)] gap-3 rounded-md border border-[var(--app-field-border)] bg-[var(--app-surface)] px-3 py-2 transition-colors"
              :class="selectedRowClass(fieldRowId(child.id))"
              @mouseenter="selectRow(fieldRowId(child.id))"
            >
              <span class="detail-label text-sm font-semibold">
                {{ fieldLabel(t, child.kind, child.label) }}
              </span>
              <span class="break-words" :class="{ 'font-mono': child.sensitive }">
                {{ displayValue(child, showSensitive) }}
              </span>
            </div>
          </div>
          <div
            v-else
            :ref="(element) => setRowElement(fieldRowId(field.id), element)"
            class="grid min-h-11 grid-cols-[124px_minmax(0,1fr)] items-center gap-3 px-3 py-2 transition-colors"
            :class="selectedRowClass(fieldRowId(field.id))"
            @mouseenter="selectRow(fieldRowId(field.id))"
          >
            <span class="detail-label text-sm font-semibold">
              {{ fieldLabel(t, field.kind, field.label) }}
            </span>
            <span class="break-words" :class="{ 'font-mono': field.sensitive }">
              {{ displayValue(field, showSensitive) }}
            </span>
          </div>
        </div>

        <div
          v-if="notesText"
          :ref="(element) => setRowElement('item-notes', element)"
          class="detail-field-row grid grid-cols-[124px_minmax(0,1fr)] gap-3 border-b px-3 py-2.5 transition-colors last:border-b-0"
          :class="selectedRowClass('item-notes')"
          @mouseenter="selectRow('item-notes')"
        >
          <span class="detail-label text-sm font-semibold">{{ t('editor.notes') }}</span>
          <span class="whitespace-pre-wrap break-words text-sm leading-6">{{ notesText }}</span>
        </div>

        <div
          v-for="field in noteFields"
          :key="field.id"
          :ref="(element) => setRowElement(fieldRowId(field.id), element)"
          class="detail-field-row grid grid-cols-[124px_minmax(0,1fr)] gap-3 border-b px-3 py-2.5 transition-colors last:border-b-0"
          :class="selectedRowClass(fieldRowId(field.id))"
          @mouseenter="selectRow(fieldRowId(field.id))"
        >
          <span class="detail-label text-sm font-semibold">
            {{ fieldLabel(t, field.kind, field.label) }}
          </span>
          <span class="whitespace-pre-wrap break-words text-sm leading-6">{{ field.value }}</span>
        </div>
      </div>

      <div v-if="attachments.length" class="mt-4 grid gap-2">
        <div class="flex items-center gap-2 text-sm font-semibold">
          <Paperclip class="size-4" />
          {{ t('detail.attachments') }}
        </div>
        <div
          v-for="attachment in attachments"
          :key="attachment.id"
          :ref="(element) => setRowElement(attachmentRowId(attachment.id), element)"
          class="detail-surface grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2 transition-colors"
          :class="selectedRowClass(attachmentRowId(attachment.id))"
          @mouseenter="selectRow(attachmentRowId(attachment.id))"
        >
          <span class="truncate font-semibold">{{ attachment.fileName }}</span>
          <span class="text-xs text-[var(--app-muted)]">
            {{ formatFileSize(attachment.sizeBytes) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
