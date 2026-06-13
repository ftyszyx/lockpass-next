<script setup lang="ts">
import { Image, Paperclip, Plus, Save, Upload, WandSparkles, X } from '@lucide/vue'
import type { Vault, VaultItemField, VaultItemFieldKind, VaultItemType } from '@lockpass/core'
import { computed, onBeforeUnmount, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { loadAttachmentFile } from '@/services/vaultRepository'
import { attachmentIcon, attachmentKind, fieldLabel, formatFileSize, isImageAttachment, typeLabel } from '../formatters'
import { editorTypes, type ItemDraft } from '../types'
import ImagePreviewModal from './ImagePreviewModal.vue'

const props = defineProps<{
  editingItemId: string | null
  draft: ItemDraft
  writableVaults: Vault[]
  uploadingFiles: boolean
  error: string
  vaultKey: Uint8Array | null
  keyId: string | null
}>()

const emit = defineEmits<{
  close: []
  save: []
  changeType: [type: VaultItemType]
  filesSelected: [event: Event]
  removeAttachment: [id: string]
  removeField: [id: string]
  generateField: [field: VaultItemField]
  addTotp: []
}>()

const { t } = useI18n()
const hasTotp = computed(() => props.draft.fields.some((field) => field.kind === 'totp'))
const preview = reactive({
  visible: false,
  loading: false,
  error: '',
  fileName: '',
  url: ''
})

function isRequiredField(kind: VaultItemFieldKind): boolean {
  if (props.draft.type === 'login') return kind === 'password'
  if (props.draft.type === 'payment-card') return kind === 'card-number'
  return false
}

function isOptionalField(kind: VaultItemFieldKind): boolean {
  return kind === 'totp'
}

async function previewImage(attachment: ItemDraft['attachments'][number]): Promise<void> {
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
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40">
    <section class="flex max-h-[92vh] w-[560px] max-w-[94vw] flex-col rounded-lg border border-slate-200 bg-white shadow-2xl">
      <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
        <h3 class="font-bold">{{ editingItemId ? t('editor.editTitle') : t('editor.newTitle') }}</h3>
        <button class="icon-button" @click="emit('close')"><X class="size-4" /></button>
      </div>
      <div class="min-h-0 overflow-auto p-4">
        <div class="grid gap-3">
          <label class="form-label">
            <span>{{ t('editor.type') }}<span class="required-mark" :title="t('editor.required')">*</span></span>
            <select class="form-input" :value="draft.type" @change="emit('changeType', ($event.target as HTMLSelectElement).value as VaultItemType)">
              <option v-for="type in editorTypes" :key="type" :value="type">{{ typeLabel(t, type) }}</option>
            </select>
          </label>
          <label class="form-label">
            <span>{{ t('editor.vault') }}<span class="required-mark" :title="t('editor.required')">*</span></span>
            <select v-model="draft.vaultId" class="form-input">
              <option v-for="vault in writableVaults" :key="vault.id" :value="vault.id">{{ vault.name }}</option>
            </select>
          </label>
          <label class="form-label">
            <span>{{ t('editor.name') }}<span class="required-mark" :title="t('editor.required')">*</span></span>
            <input v-model="draft.title" class="form-input" />
          </label>

          <div v-for="field in draft.fields" :key="field.id" class="form-label">
            <span class="flex items-center justify-between gap-3">
              <span>
                {{ fieldLabel(t, field.kind, field.label) }}
                <span v-if="isRequiredField(field.kind)" class="required-mark" :title="t('editor.required')">*</span>
              </span>
              <button v-if="isOptionalField(field.kind)" class="text-xs font-semibold text-slate-500 hover:text-rose-600" type="button" @click="emit('removeField', field.id)">
                {{ t('editor.removeOptionalField') }}
              </button>
            </span>
            <div v-if="field.kind === 'password' || field.kind === 'secret' || field.kind === 'recovery-code'" class="grid grid-cols-[1fr_auto] gap-2">
              <input v-model="field.value" class="form-input" />
              <button class="plain-button" type="button" @click="emit('generateField', field)">
                <WandSparkles class="size-4" />
                {{ t('editor.generate') }}
              </button>
            </div>
            <input v-else-if="field.kind === 'totp'" v-model="field.value" class="form-input" autocomplete="off" :placeholder="t('editor.totpPlaceholder')" />
            <input v-else v-model="field.value" class="form-input" />
          </div>

          <button v-if="draft.type === 'login' && !hasTotp" class="plain-button justify-self-start" type="button" @click="emit('addTotp')">
            <Plus class="size-4" />
            {{ t('editor.addTotp') }}
          </button>

          <label class="form-label">
            <span>
              {{ t('editor.notes') }}
              <span v-if="draft.type === 'secure-note'" class="required-mark" :title="t('editor.required')">*</span>
            </span>
            <textarea v-model="draft.notes" class="form-input min-h-20"></textarea>
          </label>

          <div class="grid gap-2">
            <span class="text-xs font-bold text-slate-500">
              {{ t('detail.attachments') }}
            </span>
            <div class="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <strong>{{ t('editor.uploadTitle') }}</strong>
                  <span class="block text-xs text-slate-500">{{ t('editor.uploadHint') }}</span>
                </div>
                <label class="plain-button">
                  <Upload class="size-4" />
                  {{ uploadingFiles ? t('app.loading') : t('editor.upload') }}
                  <input class="hidden" type="file" multiple :disabled="uploadingFiles" @change="emit('filesSelected', $event)" />
                </label>
              </div>
              <div class="grid gap-2">
                <div v-if="!draft.attachments.length" class="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
                  <span class="file-icon"><Paperclip class="size-4" /></span>
                  <span><strong class="block">{{ t('editor.noDraftAttachments') }}</strong><small class="text-slate-500">{{ t('editor.draftHint') }}</small></span>
                </div>
                <div
                  v-for="attachment in draft.attachments"
                  :key="attachment.id"
                  class="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"
                  :class="{ 'cursor-pointer hover:border-teal-200 hover:bg-teal-50/40': isImageAttachment(attachment) }"
                  @click="previewImage(attachment)"
                >
                  <span class="file-icon">{{ attachmentIcon(attachment) }}</span>
                  <span class="min-w-0">
                    <strong class="block truncate">{{ attachment.fileName }}</strong>
                    <small class="text-slate-500">{{ attachmentKind(t, attachment) }} / {{ formatFileSize(attachment.sizeBytes) }}</small>
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
                    <button class="icon-button" @click.stop="emit('removeAttachment', attachment.id)"><X class="size-4" /></button>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <p v-if="error" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
        <button class="plain-button" @click="emit('close')">{{ t('editor.cancel') }}</button>
        <button class="primary-button" :disabled="!draft.vaultId || uploadingFiles" @click="emit('save')"><Save class="size-4" />{{ t('editor.save') }}</button>
      </div>
    </section>

    <ImagePreviewModal
      :visible="preview.visible"
      :title="preview.fileName"
      :url="preview.url"
      :loading="preview.loading"
      :error="preview.error"
      :loading-text="t('app.loading')"
      @close="closePreview"
    />
  </div>
</template>
