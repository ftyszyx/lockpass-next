<script setup lang="ts">
import { PlugZap, Save } from '@lucide/vue'
import { PasswordInput } from '@lockpass/ui'
import { t } from '@/i18n'
import type { EmailServiceConfig } from '@/types'

defineProps<{
  saving: boolean
  testing: boolean
  message?: string
  error?: string
}>()

defineEmits<{
  save: []
  test: []
}>()

const config = defineModel<EmailServiceConfig>({ required: true })
</script>

<template>
  <section class="lp-panel">
    <div class="lp-panel-head flex-wrap py-2">
      <div>
        <h2 class="m-0 text-base font-black">{{ t('adminSystem.smtpSettingsTitle') }}</h2>
        <p class="m-0 mt-1 text-xs font-semibold text-slate-500">{{ t('adminSystem.smtpSettingsSummary') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          class="lp-button"
          type="button"
          :disabled="testing || saving || config.mode !== 'smtp'"
          @click="$emit('test')"
        >
          <PlugZap class="size-4" />
          {{ testing ? t('adminSystem.testingConnection') : t('adminSystem.testConnection') }}
        </button>
        <button class="lp-button-primary" type="button" :disabled="saving || testing" @click="$emit('save')">
          <Save class="size-4" />
          {{ saving ? t('common.processing') : t('common.save') }}
        </button>
      </div>
    </div>

    <div class="lp-panel-body gap-4">
      <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
      <p v-else-if="message" class="m-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{{ message }}</p>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label class="lp-label">
          {{ t('adminSystem.emailMode') }}
          <select v-model="config.mode" class="lp-input">
            <option value="log">{{ t('adminSystem.emailModeLog') }}</option>
            <option value="smtp">{{ t('adminSystem.emailModeSmtp') }}</option>
          </select>
        </label>
        <label class="lp-label">
          {{ t('adminSystem.emailFrom') }}
          <input v-model.trim="config.from" class="lp-input" type="text" />
        </label>
        <label class="lp-label">
          {{ t('adminSystem.smtpHost') }}
          <input v-model.trim="config.smtpHost" class="lp-input" type="text" autocomplete="off" />
        </label>
        <label class="lp-label">
          {{ t('adminSystem.smtpPort') }}
          <input v-model.number="config.smtpPort" class="lp-input" type="number" min="1" max="65535" />
        </label>
        <label class="lp-label">
          {{ t('adminSystem.smtpUsername') }}
          <input v-model.trim="config.smtpUsername" class="lp-input" type="text" autocomplete="username" />
        </label>
        <label class="lp-label">
          {{ t('adminSystem.smtpPassword') }}
          <PasswordInput
            v-model="config.smtpPassword"
            class="lp-input"
            autocomplete="new-password"
            :placeholder="config.smtpPasswordSet ? t('adminSystem.passwordKeepPlaceholder') : ''"
            :show-label="t('common.showPassword')"
            :hide-label="t('common.hidePassword')"
          />
        </label>
      </div>

      <details class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <summary class="cursor-pointer text-sm font-bold text-slate-700">{{ t('adminSystem.verificationSecurity') }}</summary>
        <label class="lp-label mt-3 max-w-xl">
          {{ t('adminSystem.emailCodeSecret') }}
          <PasswordInput
            v-model="config.codeSecret"
            class="lp-input"
            autocomplete="new-password"
            :placeholder="config.codeSecretSet ? t('adminSystem.passwordKeepPlaceholder') : ''"
            :show-label="t('common.showPassword')"
            :hide-label="t('common.hidePassword')"
          />
        </label>
      </details>
    </div>
  </section>
</template>
