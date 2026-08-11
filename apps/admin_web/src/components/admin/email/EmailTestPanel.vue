<script setup lang="ts">
import { Send } from '@lucide/vue'
import { computed, ref } from 'vue'
import { t, useI18n } from '@/i18n'
import type { EmailTemplateSummary } from '@/types'
import { emailTemplateLocaleLabel, useEmailTemplateSelection } from './useEmailTemplateSelection'

const props = defineProps<{
  templates: EmailTemplateSummary[]
  sending: boolean
  disabled: boolean
  message?: string
  error?: string
}>()

const emit = defineEmits<{
  send: [payload: { recipient: string; templateId: string }]
}>()

const { locale } = useI18n()
const recipient = ref('')
const {
  selectedEvent,
  selectedLocale,
  selectedTemplate,
  templateOptions,
  localeOptions
} = useEmailTemplateSelection(() => props.templates, locale)
const canSend = computed(() => Boolean(recipient.value.trim() && selectedTemplate.value) && !props.disabled && !props.sending)

function send() {
  if (!canSend.value || !selectedTemplate.value) return
  emit('send', { recipient: recipient.value.trim(), templateId: selectedTemplate.value.id })
}
</script>

<template>
  <section class="lp-panel">
    <div class="lp-panel-head">
      <div>
        <h2 class="m-0 text-base font-black">{{ t('adminSystem.testEmailTitle') }}</h2>
        <p class="m-0 mt-1 text-xs font-semibold text-slate-500">{{ t('adminSystem.testEmailSummary') }}</p>
      </div>
    </div>
    <form class="lp-panel-body" @submit.prevent="send">
      <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
      <p v-else-if="message" class="m-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{{ message }}</p>
      <div class="grid grid-cols-1 items-end gap-3 xl:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_auto]">
        <label class="lp-label">
          {{ t('adminSystem.testRecipient') }}
          <input
            v-model.trim="recipient"
            class="lp-input"
            type="email"
            required
            :placeholder="t('adminSystem.testRecipientPlaceholder')"
          />
        </label>
        <label class="lp-label">
          {{ t('adminSystem.templateLanguage') }}
          <select v-model="selectedLocale" class="lp-input" required>
            <option v-for="option in localeOptions" :key="option" :value="option">
              {{ emailTemplateLocaleLabel(option) }}
            </option>
          </select>
        </label>
        <label class="lp-label">
          {{ t('adminSystem.emailTemplate') }}
          <select v-model="selectedEvent" class="lp-input" required>
            <option v-for="option in templateOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
        <button class="lp-button-primary" type="submit" :disabled="!canSend">
          <Send class="size-4" />
          {{ sending ? t('adminSystem.sendingTestEmail') : t('adminSystem.sendTestEmail') }}
        </button>
      </div>
    </form>
  </section>
</template>
