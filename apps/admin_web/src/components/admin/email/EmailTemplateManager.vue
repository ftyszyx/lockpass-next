<script setup lang="ts">
import { Eye, RotateCcw, Save } from '@lucide/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { api } from '@/api/client'
import { t, useI18n } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { EmailTemplateDetail, EmailTemplateSummary } from '@/types'
import { emailTemplateLocaleLabel, useEmailTemplateSelection } from './useEmailTemplateSelection'

const props = defineProps<{
  templates: EmailTemplateSummary[]
  loadingTemplates: boolean
  loadError?: string
}>()

const emit = defineEmits<{
  changed: []
}>()

const session = useSessionStore()
const { locale } = useI18n()
const {
  selectedEvent,
  selectedLocale,
  selectedTemplate,
  templateOptions,
  localeOptions
} = useEmailTemplateSelection(() => props.templates, locale)
const selectedId = computed(() => selectedTemplate.value?.id ?? '')
const template = ref<EmailTemplateDetail | null>(null)
const subject = ref('')
const html = ref('')
const previewSubject = ref('')
const previewHtml = ref('')
const loading = ref(false)
const saving = ref(false)
const previewing = ref(false)
const restoring = ref(false)
const error = ref('')
const message = ref('')
const htmlEditor = ref<HTMLTextAreaElement | null>(null)

const canEdit = computed(() => Boolean(template.value && subject.value.trim() && html.value.trim()))

watch(selectedId, () => void loadTemplate(), { immediate: true })

watch(locale, () => {
  error.value = ''
  message.value = ''
})

async function loadTemplate() {
  if (!session.token || !selectedId.value) {
    template.value = null
    return
  }
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    const next = await api.adminEmailTemplate(session.token, selectedId.value)
    applyTemplate(next)
    await preview()
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    loading.value = false
  }
}

function applyTemplate(next: EmailTemplateDetail) {
  template.value = next
  subject.value = next.subject
  html.value = next.html
}

async function save() {
  if (!session.token || !selectedId.value || !canEdit.value || saving.value) return
  saving.value = true
  error.value = ''
  message.value = ''
  try {
    applyTemplate(await api.updateAdminEmailTemplate(session.token, selectedId.value, subject.value, html.value))
    await preview()
    message.value = t('adminSystem.templateSaved')
    emit('changed')
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    saving.value = false
  }
}

async function preview() {
  if (!session.token || !selectedId.value || !subject.value.trim() || !html.value.trim() || previewing.value) return
  previewing.value = true
  error.value = ''
  try {
    const result = await api.previewAdminEmailTemplate(session.token, selectedId.value, subject.value, html.value)
    previewSubject.value = result.subject
    previewHtml.value = result.html
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    previewing.value = false
  }
}

async function restore() {
  if (!session.token || !selectedId.value || restoring.value) return
  if (!window.confirm(t('adminSystem.restoreTemplateConfirm'))) return
  restoring.value = true
  error.value = ''
  message.value = ''
  try {
    applyTemplate(await api.restoreAdminEmailTemplate(session.token, selectedId.value))
    await preview()
    message.value = t('adminSystem.templateRestored')
    emit('changed')
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    restoring.value = false
  }
}

async function insertPlaceholder(placeholder: string) {
  const editor = htmlEditor.value
  if (!editor) {
    html.value += placeholder
    return
  }
  const start = editor.selectionStart
  const end = editor.selectionEnd
  html.value = `${html.value.slice(0, start)}${placeholder}${html.value.slice(end)}`
  await nextTick()
  editor.focus()
  editor.setSelectionRange(start + placeholder.length, start + placeholder.length)
}
</script>

<template>
  <section class="lp-panel">
    <div class="lp-panel-head flex-wrap py-2">
      <div>
        <h2 class="m-0 text-base font-black">{{ t('adminSystem.templatesTitle') }}</h2>
        <p class="m-0 mt-1 text-xs font-semibold text-slate-500">{{ t('adminSystem.templatesSummary') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button class="lp-button" type="button" :disabled="!canEdit || previewing" @click="preview">
          <Eye class="size-4" />
          {{ previewing ? t('common.processing') : t('adminSystem.previewTemplate') }}
        </button>
        <button class="lp-button" type="button" :disabled="!template?.isCustom || restoring" @click="restore">
          <RotateCcw class="size-4" />
          {{ t('adminSystem.restoreTemplate') }}
        </button>
        <button class="lp-button-primary" type="button" :disabled="!canEdit || saving" @click="save">
          <Save class="size-4" />
          {{ saving ? t('common.processing') : t('adminSystem.saveTemplate') }}
        </button>
      </div>
    </div>

    <div class="lp-panel-body gap-4">
      <p v-if="error || loadError" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
        {{ error || loadError }}
      </p>
      <p v-else-if="message" class="m-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{{ message }}</p>

      <div class="grid grid-cols-1 items-end gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(160px,0.6fr)_auto]">
        <label class="lp-label">
          {{ t('adminSystem.templateLanguage') }}
          <select v-model="selectedLocale" class="lp-input" :disabled="loadingTemplates || loading">
            <option v-for="option in localeOptions" :key="option" :value="option">
              {{ emailTemplateLocaleLabel(option) }}
            </option>
          </select>
        </label>
        <label class="lp-label">
          {{ t('adminSystem.emailTemplate') }}
          <select v-model="selectedEvent" class="lp-input" :disabled="loadingTemplates || loading">
            <option v-for="option in templateOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <span v-if="template" class="lp-pill mb-2" :class="template.isCustom ? 'lp-pill-ok' : ''">
          {{ template.isCustom ? t('adminSystem.customTemplate') : t('adminSystem.officialTemplate') }}
        </span>
      </div>

      <div v-if="template" class="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div class="grid content-start gap-4">
          <label class="lp-label">
            {{ t('adminSystem.templateSubject') }}
            <input v-model="subject" class="lp-input" type="text" maxlength="200" />
          </label>
          <label class="lp-label">
            {{ t('adminSystem.templateHtml') }}
            <textarea
              ref="htmlEditor"
              v-model="html"
              class="min-h-[32rem] w-full resize-y rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-950 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-700/10"
              spellcheck="false"
            />
          </label>
          <div class="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <strong class="block text-xs text-slate-700">{{ t('adminSystem.templatePlaceholders') }}</strong>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                v-for="placeholder in template.placeholders"
                :key="placeholder"
                class="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-700 hover:border-teal-600 hover:text-teal-700"
                type="button"
                :title="t('adminSystem.insertPlaceholder')"
                @click="insertPlaceholder(placeholder)"
              >
                {{ placeholder }}
              </button>
            </div>
          </div>
        </div>

        <div class="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          <div class="border-b border-slate-200 bg-white px-3 py-2">
            <strong class="block text-sm text-slate-900">{{ t('adminSystem.templatePreview') }}</strong>
            <small class="mt-0.5 block truncate text-xs font-semibold text-slate-500">{{ previewSubject || '-' }}</small>
          </div>
          <iframe
            class="h-[40rem] w-full border-0 bg-white"
            sandbox=""
            :srcdoc="previewHtml"
            :title="t('adminSystem.templatePreview')"
          />
        </div>
      </div>
    </div>
  </section>
</template>
