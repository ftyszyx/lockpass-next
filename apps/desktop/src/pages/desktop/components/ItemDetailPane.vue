<script setup lang="ts">
import { Copy, Eye, FolderLock, Image, Paperclip, Pencil, ShieldCheck } from '@lucide/vue'
import type { VaultAttachment, VaultItem, VaultItemField } from '@lockpass/core'
import { computed, onBeforeUnmount, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { fieldsWithoutRedundantLegacyNote } from '@/services/legacyImportRepair'
import { loadAttachmentFile } from '@/services/vaultRepository'
import { useVaultStore } from '@/stores/vault'
import {
  attachmentIcon,
  attachmentKind,
  detailFields,
  displayValue,
  fieldLabel,
  formatFileSize,
  isImageAttachment,
  typeLabel
} from '../formatters'
import { detailTabs, type DetailTab } from '../types'
import ImagePreviewModal from './ImagePreviewModal.vue'

const props = defineProps<{
  selectedItem: VaultItem | null
  attachments: VaultAttachment[]
  activeTab: DetailTab
  showSensitive: boolean
  vaultSessionId: string | null
  keyId: string | null
}>()

const emit = defineEmits<{
  'update:activeTab': [tab: DetailTab]
  'update:showSensitive': [value: boolean]
  edit: []
  copyValue: [value: string, message?: string]
  securityCheck: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const notesText = computed(() => props.selectedItem?.notes || '')
const noteFields = computed(() => {
  const item = props.selectedItem
  return item
    ? fieldsWithoutRedundantLegacyNote(item).filter((field) => field.kind === 'note')
    : []
})
const preview = reactive({
  visible: false,
  loading: false,
  error: '',
  fileName: '',
  url: ''
})

function onFieldAction(field: VaultItemField): void {
  if (field.sensitive && !props.showSensitive) {
    emit('update:showSensitive', true)
    return
  }

  emit('copyValue', field.value)
}

async function previewImage(attachment: VaultAttachment): Promise<void> {
  if (!isImageAttachment(attachment)) return
  if (!props.vaultSessionId || !props.keyId) return

  revokePreviewUrl()
  preview.visible = true
  preview.loading = true
  preview.error = ''
  preview.fileName = attachment.fileName

  try {
    const blob = await loadAttachmentFile(attachment, props.vaultSessionId, props.keyId)
    preview.url = URL.createObjectURL(blob)
  } catch (error) {
    preview.error = error instanceof Error ? error.message : String(error)
  } finally {
    preview.loading = false
  }
}

function closePreview(): void {
  preview.visible = false
  preview.fileName = ''
  preview.error = ''
  revokePreviewUrl()
}

function revokePreviewUrl(): void {
  if (!preview.url) return
  URL.revokeObjectURL(preview.url)
  preview.url = ''
}

onBeforeUnmount(revokePreviewUrl)
</script>

<template>
  <section class="app-detail-panel min-h-0 overflow-auto p-5">
    <div v-if="selectedItem" class="mx-auto max-w-[780px]">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <span class="mb-1.5 inline-flex rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-0.5 text-xs font-semibold text-[var(--app-muted)]">{{ typeLabel(t, selectedItem.type) }}</span>
          <h1 class="text-xl font-bold tracking-normal text-[var(--app-text)]">{{ selectedItem.title }}</h1>
          <p class="mt-1 text-sm text-[var(--app-muted)]">{{ selectedItem.subtitle }}</p>
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-2">
          <button class="plain-button whitespace-nowrap" @click="emit('update:showSensitive', !showSensitive)">
            <Eye class="size-4" />
            {{ showSensitive ? t('detail.hideSensitive') : t('detail.showSensitive') }}
          </button>
          <button class="primary-button whitespace-nowrap" @click="emit('edit')">
            <Pencil class="size-4" />
            {{ t('detail.edit') }}
          </button>
        </div>
      </div>

      <div class="detail-tabs mt-4 flex w-fit gap-1 rounded-md p-1">
        <button
          v-for="tab in detailTabs"
          :key="tab"
          class="rounded px-3 py-1.5 text-sm font-semibold"
          :class="activeTab === tab ? 'detail-tab-active' : 'detail-tab-inactive'"
          @click="emit('update:activeTab', tab)"
        >
          {{ tab === 'details' ? t('detail.details') : tab === 'history' ? t('detail.history') : t('detail.security') }}
        </button>
      </div>

      <div v-if="activeTab === 'details'" class="detail-surface mt-4 overflow-hidden rounded-md border">
        <div
          v-for="field in detailFields(t, selectedItem)"
          :key="field.id"
          class="detail-field-row border-b last:border-b-0"
        >
          <div v-if="field.kind === 'group'" class="grid gap-1.5 bg-[var(--app-surface-muted)] px-3 py-2.5">
            <span class="detail-label text-sm font-semibold">{{ fieldLabel(t, field.kind, field.label) }}</span>
            <div
              v-for="child in field.children ?? []"
              :key="child.id"
              class="grid min-h-10 grid-cols-[116px_minmax(0,1fr)_34px] items-center gap-3 rounded-md border border-[var(--app-field-border)] bg-[var(--app-surface)] px-2 py-1"
            >
              <span class="detail-label text-sm font-semibold">{{ fieldLabel(t, child.kind, child.label) }}</span>
              <span class="break-words" :class="{ 'font-mono': child.sensitive }">{{ displayValue(child, showSensitive) }}</span>
              <button class="icon-button" @click="onFieldAction(child)">
                <Eye v-if="child.sensitive && !showSensitive" class="size-4" />
                <Copy v-else class="size-4" />
              </button>
            </div>
          </div>
          <div v-else class="grid min-h-11 grid-cols-[124px_minmax(0,1fr)_34px] items-center gap-3 px-3 py-1.5">
            <span class="detail-label text-sm font-semibold">{{ fieldLabel(t, field.kind, field.label) }}</span>
            <span class="break-words" :class="{ 'font-mono': field.sensitive }">{{ displayValue(field, showSensitive) }}</span>
            <button class="icon-button" @click="onFieldAction(field)">
              <Eye v-if="field.sensitive && !showSensitive" class="size-4" />
              <Copy v-else class="size-4" />
            </button>
          </div>
        </div>

        <div v-if="notesText" class="detail-field-row grid min-h-11 grid-cols-[124px_minmax(0,1fr)] gap-3 border-b px-3 py-2.5 last:border-b-0">
          <span class="detail-label text-sm font-semibold">{{ t('editor.notes') }}</span>
          <span class="whitespace-pre-wrap break-words text-sm leading-6">{{ notesText }}</span>
        </div>

        <div
          v-for="field in noteFields"
          :key="field.id"
          class="detail-field-row grid min-h-11 grid-cols-[124px_minmax(0,1fr)] gap-3 border-b px-3 py-2.5 last:border-b-0"
        >
          <span class="detail-label text-sm font-semibold">{{ fieldLabel(t, field.kind, field.label) }}</span>
          <span class="whitespace-pre-wrap break-words text-sm leading-6">{{ field.value }}</span>
        </div>
      </div>

      <div v-if="activeTab === 'details' && attachments.length" class="mt-4 grid gap-2.5">
        <div class="flex items-center gap-2 font-semibold">
          <Paperclip class="size-4" />
          {{ t('detail.attachments') }}
        </div>
        <div class="grid gap-2">
          <div
            v-for="attachment in attachments"
            :key="attachment.id"
            class="detail-surface grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-md border p-2"
            :class="{ 'cursor-pointer hover:border-teal-200 hover:bg-teal-50/40': isImageAttachment(attachment) }"
            @click="previewImage(attachment)"
          >
            <span class="file-icon">{{ attachmentIcon(attachment) }}</span>
            <span class="min-w-0">
              <span class="block truncate font-bold">{{ attachment.fileName }}</span>
              <span class="text-xs text-slate-500">
                {{ attachmentKind(t, attachment) }} / {{ formatFileSize(attachment.sizeBytes) }} / {{ attachment.checksumSha256.slice(0, 19) }}
              </span>
            </span>
            <span class="flex items-center gap-1">
              <button
                v-if="isImageAttachment(attachment)"
                class="icon-button"
                :title="t('attachment.previewImage')"
                @click.stop="previewImage(attachment)"
              >
                <Image class="size-4" />
              </button>
              <button class="icon-button" :title="t('attachment.copyName')" @click.stop="emit('copyValue', attachment.fileName, t('toast.copiedFileName'))">
                <Copy class="size-4" />
              </button>
            </span>
          </div>
        </div>
      </div>

      <div v-else-if="activeTab === 'history'" class="detail-surface mt-4 overflow-hidden rounded-md border">
        <div class="detail-field-row grid grid-cols-[160px_minmax(0,1fr)] gap-3 border-b p-3">
          <time class="text-xs text-slate-500">{{ new Date(selectedItem.updatedAt).toLocaleString(vaultStore.settings.locale) }}</time>
          <span>{{ t('detail.updatedLocal') }}</span>
        </div>
        <div class="grid grid-cols-[160px_minmax(0,1fr)] gap-3 p-3">
          <time class="text-xs text-slate-500">{{ new Date(selectedItem.createdAt).toLocaleString(vaultStore.settings.locale) }}</time>
          <span>{{ t('detail.createdLocal') }}</span>
        </div>
      </div>

      <div v-else class="detail-surface mt-4 overflow-hidden rounded-md border">
        <div class="detail-field-row grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3 border-b p-3">
          <span class="text-sm font-bold text-slate-500">{{ t('detail.strength') }}</span>
          <div class="h-2 overflow-hidden rounded-full bg-slate-200">
            <span class="block h-full w-3/4 bg-[var(--app-primary)]"></span>
          </div>
          <span class="rounded-full bg-[var(--app-tabs)] px-2 py-1 text-xs font-bold text-[var(--app-nav-text)]">{{ t('detail.strong') }}</span>
        </div>
        <div class="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3 p-3">
          <span class="text-sm font-bold text-slate-500">{{ t('detail.breachCheck') }}</span>
          <span>{{ t('detail.noRisk') }}</span>
          <button class="icon-button" :title="t('detail.checkSecurity')" @click="emit('securityCheck')">
            <ShieldCheck class="size-4" />
          </button>
        </div>
      </div>
    </div>

    <div v-else class="grid h-full place-items-center text-center">
      <div class="grid max-w-[300px] gap-3">
        <span class="mx-auto grid size-10 place-items-center rounded-md bg-[var(--app-tabs)] text-[var(--app-muted)]">
          <FolderLock class="size-5" />
        </span>
        <strong>{{ t('detail.noSelectionTitle') }}</strong>
        <span class="text-sm text-slate-500">{{ t('detail.noSelectionBody') }}</span>
      </div>
    </div>

    <ImagePreviewModal
      :visible="preview.visible"
      :title="preview.fileName"
      :url="preview.url"
      :loading="preview.loading"
      :error="preview.error"
      :loading-text="t('app.loading')"
      @close="closePreview"
    />
  </section>
</template>
