<script setup lang="ts">
import { Copy, Eye, FolderLock, Image, Paperclip, Pencil, ShieldCheck } from '@lucide/vue'
import type { VaultAttachment, VaultItem, VaultItemField } from '@lockpass/core'
import { computed, onBeforeUnmount, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
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
  vaultKey: Uint8Array | null
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
const noteFields = computed(() => props.selectedItem?.fields.filter((field) => field.kind === 'note') ?? [])
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
  if (!props.vaultKey || !props.keyId) return

  revokePreviewUrl()
  preview.visible = true
  preview.loading = true
  preview.error = ''
  preview.fileName = attachment.fileName

  try {
    const blob = await loadAttachmentFile(attachment, props.vaultKey, props.keyId)
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
  <section class="min-h-0 overflow-auto bg-[#f7f8fa] p-6">
    <div v-if="selectedItem" class="mx-auto max-w-3xl">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <span class="mb-2 inline-flex rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-500 ring-1 ring-slate-200">{{ typeLabel(t, selectedItem.type) }}</span>
          <h1 class="text-2xl font-black tracking-normal">{{ selectedItem.title }}</h1>
          <p class="mt-1 text-sm text-slate-500">{{ selectedItem.subtitle }}</p>
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

      <div class="mt-6 flex gap-1 rounded-lg bg-slate-200/70 p-1">
        <button
          v-for="tab in detailTabs"
          :key="tab"
          class="rounded-md px-3 py-1.5 text-sm font-bold"
          :class="activeTab === tab ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500 hover:text-slate-950'"
          @click="emit('update:activeTab', tab)"
        >
          {{ tab === 'details' ? t('detail.details') : tab === 'history' ? t('detail.history') : t('detail.security') }}
        </button>
      </div>

      <div v-if="activeTab === 'details'" class="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div
          v-for="field in detailFields(t, selectedItem)"
          :key="field.id"
          class="grid min-h-12 grid-cols-[140px_minmax(0,1fr)_40px] items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
        >
          <span class="text-sm font-bold text-slate-500">{{ fieldLabel(t, field.kind, field.label) }}</span>
          <span class="break-words" :class="{ 'font-mono': field.sensitive }">{{ displayValue(field, showSensitive) }}</span>
          <button class="icon-button" @click="onFieldAction(field)">
            <Eye v-if="field.sensitive && !showSensitive" class="size-4" />
            <Copy v-else class="size-4" />
          </button>
        </div>

        <div v-if="notesText" class="grid min-h-12 grid-cols-[140px_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0">
          <span class="text-sm font-bold text-slate-500">{{ t('editor.notes') }}</span>
          <span class="whitespace-pre-wrap break-words text-sm leading-6">{{ notesText }}</span>
        </div>

        <div
          v-for="field in noteFields"
          :key="field.id"
          class="grid min-h-12 grid-cols-[140px_minmax(0,1fr)] gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0"
        >
          <span class="text-sm font-bold text-slate-500">{{ fieldLabel(t, field.kind, field.label) }}</span>
          <span class="whitespace-pre-wrap break-words text-sm leading-6">{{ field.value }}</span>
        </div>
      </div>

      <div v-if="activeTab === 'details' && attachments.length" class="mt-5 grid gap-3">
        <div class="flex items-center gap-2 font-bold">
          <Paperclip class="size-4" />
          {{ t('detail.attachments') }}
        </div>
        <div class="grid gap-2">
          <div
            v-for="attachment in attachments"
            :key="attachment.id"
            class="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"
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

      <div v-else-if="activeTab === 'history'" class="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="grid grid-cols-[160px_minmax(0,1fr)] gap-3 border-b border-slate-100 p-3">
          <time class="text-xs text-slate-500">{{ new Date(selectedItem.updatedAt).toLocaleString(vaultStore.settings.locale) }}</time>
          <span>{{ t('detail.updatedLocal') }}</span>
        </div>
        <div class="grid grid-cols-[160px_minmax(0,1fr)] gap-3 p-3">
          <time class="text-xs text-slate-500">{{ new Date(selectedItem.createdAt).toLocaleString(vaultStore.settings.locale) }}</time>
          <span>{{ t('detail.createdLocal') }}</span>
        </div>
      </div>

      <div v-else class="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div class="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-100 p-3">
          <span class="text-sm font-bold text-slate-500">{{ t('detail.strength') }}</span>
          <div class="h-2 overflow-hidden rounded-full bg-slate-200">
            <span class="block h-full w-3/4 bg-gradient-to-r from-amber-600 to-green-700"></span>
          </div>
          <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{{ t('detail.strong') }}</span>
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
        <span class="mx-auto grid size-11 place-items-center rounded-lg bg-slate-100 text-slate-500">
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
