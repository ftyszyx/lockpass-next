<script setup lang="ts">
import { FileText, Send, Server } from '@lucide/vue'
import { ref, watch } from 'vue'
import { api } from '@/api/client'
import { t, useI18n } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { EmailServiceConfig, EmailServicePatch, EmailTemplateSummary } from '@/types'
import EmailSmtpSettings from './EmailSmtpSettings.vue'
import EmailTemplateManager from './EmailTemplateManager.vue'
import EmailTestPanel from './EmailTestPanel.vue'

const props = defineProps<{
  config: EmailServiceConfig
  activePanel: 'smtp' | 'test' | 'templates'
}>()

const emit = defineEmits<{
  saved: [config: EmailServiceConfig]
}>()

const session = useSessionStore()
const { locale } = useI18n()
const draft = ref(normalizeConfig(props.config))
const templates = ref<EmailTemplateSummary[]>([])
const loadingTemplates = ref(false)
const saving = ref(false)
const testing = ref(false)
const sending = ref(false)
const smtpMessage = ref('')
const smtpError = ref('')
const testMessage = ref('')
const testError = ref('')
const templatesError = ref('')

watch(
  () => props.config,
  (config) => {
    draft.value = normalizeConfig(config)
  }
)

watch(locale, () => {
  smtpMessage.value = ''
  smtpError.value = ''
  testMessage.value = ''
  testError.value = ''
  templatesError.value = ''
})

watch(
  () => props.activePanel,
  (panel) => {
    if (panel !== 'smtp') void loadTemplates()
  },
  { immediate: true }
)

function normalizeConfig(config: EmailServiceConfig): EmailServiceConfig {
  return {
    ...config,
    smtpHost: config.smtpHost ?? '',
    smtpUsername: config.smtpUsername ?? '',
    smtpPassword: '',
    codeSecret: ''
  }
}

function buildPatch(): EmailServicePatch {
  const patch: EmailServicePatch = {
    mode: draft.value.mode,
    from: draft.value.from,
    smtpHost: draft.value.smtpHost ?? '',
    smtpPort: draft.value.smtpPort,
    smtpUsername: draft.value.smtpUsername ?? ''
  }
  if (draft.value.smtpPassword?.trim()) patch.smtpPassword = draft.value.smtpPassword
  if (draft.value.codeSecret?.trim()) patch.codeSecret = draft.value.codeSecret
  return patch
}

async function save() {
  if (!session.token || saving.value) return
  saving.value = true
  smtpError.value = ''
  smtpMessage.value = ''
  try {
    const result = await api.patchAdminConfig(session.token, { email: buildPatch() })
    draft.value = normalizeConfig(result.email)
    smtpMessage.value = t('adminSystem.saved')
    emit('saved', result.email)
  } catch (cause) {
    smtpError.value = userFacingErrorMessage(cause)
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  if (!session.token || testing.value) return
  testing.value = true
  smtpError.value = ''
  smtpMessage.value = ''
  try {
    await api.testAdminEmailConnection(session.token, buildPatch())
    smtpMessage.value = t('adminSystem.connectionSuccess')
  } catch (cause) {
    smtpError.value = userFacingErrorMessage(cause)
  } finally {
    testing.value = false
  }
}

async function sendTest(payload: { recipient: string; templateId: string }) {
  if (!session.token || sending.value) return
  sending.value = true
  testError.value = ''
  testMessage.value = ''
  try {
    await api.sendAdminTestEmail(session.token, payload.recipient, payload.templateId, buildPatch())
    testMessage.value = t('adminSystem.testEmailSent')
  } catch (cause) {
    testError.value = userFacingErrorMessage(cause)
  } finally {
    sending.value = false
  }
}

async function loadTemplates() {
  if (!session.token || loadingTemplates.value) return
  loadingTemplates.value = true
  templatesError.value = ''
  try {
    templates.value = (await api.adminEmailTemplates(session.token)).templates
  } catch (cause) {
    templatesError.value = userFacingErrorMessage(cause)
  } finally {
    loadingTemplates.value = false
  }
}
</script>

<template>
  <div class="grid gap-4">
    <nav
      class="grid grid-cols-1 gap-1 rounded-lg border border-slate-200 bg-white p-1 sm:grid-cols-3"
      :aria-label="t('adminSystem.sections.email.title')"
    >
      <RouterLink
        to="/admin/system/email/smtp"
        class="flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
        :class="activePanel === 'smtp' ? 'bg-teal-50 text-teal-700' : ''"
      >
        <Server class="size-4" />
        {{ t('adminSystem.smtpSettingsTitle') }}
      </RouterLink>
      <RouterLink
        to="/admin/system/email/test"
        class="flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
        :class="activePanel === 'test' ? 'bg-teal-50 text-teal-700' : ''"
      >
        <Send class="size-4" />
        {{ t('adminSystem.testEmailTitle') }}
      </RouterLink>
      <RouterLink
        to="/admin/system/email/templates"
        class="flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-slate-950"
        :class="activePanel === 'templates' ? 'bg-teal-50 text-teal-700' : ''"
      >
        <FileText class="size-4" />
        {{ t('adminSystem.templatesTitle') }}
      </RouterLink>
    </nav>

    <EmailSmtpSettings
      v-if="activePanel === 'smtp'"
      v-model="draft"
      :saving="saving"
      :testing="testing"
      :message="smtpMessage"
      :error="smtpError"
      @save="save"
      @test="testConnection"
    />
    <EmailTestPanel
      v-else-if="activePanel === 'test'"
      :templates="templates"
      :sending="sending"
      :disabled="draft.mode !== 'smtp' || loadingTemplates"
      :message="testMessage"
      :error="testError || templatesError"
      @send="sendTest"
    />
    <EmailTemplateManager
      v-else
      :templates="templates"
      :loading-templates="loadingTemplates"
      :load-error="templatesError"
      @changed="loadTemplates"
    />
  </div>
</template>
