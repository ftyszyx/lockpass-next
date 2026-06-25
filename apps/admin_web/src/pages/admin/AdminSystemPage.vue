<script setup lang="ts">
import { Save } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api/client'
import { t } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { InstanceConfig } from '@/types'

type ConfigSection = 'general' | 'email' | 'auth' | 'quota'

const route = useRoute()
const session = useSessionStore()
const config = ref<InstanceConfig | null>(null)
const error = ref('')
const saving = ref(false)
const saved = ref(false)
const activeSection = computed<ConfigSection>(() => {
  const section = route.meta.configSection
  return section === 'email' || section === 'auth' || section === 'quota' ? section : 'general'
})

onMounted(load)

function normalizeReservedLoginConfig(nextConfig: InstanceConfig): InstanceConfig {
  return {
    ...nextConfig,
    email: {
      mode: nextConfig.email?.mode ?? 'log',
      from: nextConfig.email?.from ?? 'LockPass <no-reply@lockpass.local>',
      smtpHost: nextConfig.email?.smtpHost ?? '',
      smtpPort: nextConfig.email?.smtpPort ?? 587,
      smtpUsername: nextConfig.email?.smtpUsername ?? '',
      smtpPassword: '',
      smtpPasswordSet: Boolean(nextConfig.email?.smtpPasswordSet),
      codeSecret: '',
      codeSecretSet: Boolean(nextConfig.email?.codeSecretSet)
    },
    smsEnabled: false,
    googleEnabled: false,
    wechatEnabled: false
  }
}

function buildPatchConfig(nextConfig: InstanceConfig): Partial<InstanceConfig> {
  const email: Partial<InstanceConfig['email']> = {
    mode: nextConfig.email.mode,
    from: nextConfig.email.from,
    smtpHost: nextConfig.email.smtpHost,
    smtpPort: nextConfig.email.smtpPort,
    smtpUsername: nextConfig.email.smtpUsername
  }
  if (nextConfig.email.smtpPassword?.trim()) {
    email.smtpPassword = nextConfig.email.smtpPassword
  }
  if (nextConfig.email.codeSecret?.trim()) {
    email.codeSecret = nextConfig.email.codeSecret
  }

  return {
    ...nextConfig,
    email: email as InstanceConfig['email'],
    smsEnabled: false,
    googleEnabled: false,
    wechatEnabled: false
  }
}

async function load() {
  if (!session.token) return
  try {
    error.value = ''
    saved.value = false
    config.value = normalizeReservedLoginConfig(await api.adminConfig(session.token))
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  }
}

async function save() {
  if (!session.token || !config.value || saving.value) return
  saving.value = true
  error.value = ''
  saved.value = false
  try {
    const patchConfig = buildPatchConfig(config.value)
    config.value = normalizeReservedLoginConfig(await api.patchAdminConfig(session.token, patchConfig))
    saved.value = true
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4">
    <section class="lp-panel">
      <div class="lp-panel-head">
        <div>
          <h2 class="m-0 text-base font-black">{{ t(`adminSystem.sections.${activeSection}.title`) }}</h2>
          <p class="m-0 mt-1 text-xs font-semibold text-slate-500">{{ t(`adminSystem.sections.${activeSection}.summary`) }}</p>
        </div>
        <button class="lp-button-primary" :disabled="!config || saving" @click="save">
          <Save class="size-4" />
          {{ saving ? t('common.processing') : t('common.save') }}
        </button>
      </div>
      <div class="lp-panel-body">
        <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
        <p v-if="saved" class="m-0 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {{ t('adminSystem.saved') }}
        </p>
        <template v-if="config">
          <div v-if="activeSection === 'general'" class="grid max-w-3xl gap-4">
            <label class="lp-label">
              {{ t('adminSystem.publicBaseUrl') }}
              <input v-model.trim="config.publicBaseUrl" class="lp-input" type="url" />
            </label>
            <label class="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800">
              <input v-model="config.registrationEnabled" type="checkbox" class="size-4 accent-teal-700" />
              {{ t('adminSystem.registrationEnabled') }}
            </label>
          </div>

          <div v-else-if="activeSection === 'email'" class="grid max-w-3xl gap-4">
            <label class="lp-label">
              {{ t('adminSystem.emailMode') }}
              <select v-model="config.email.mode" class="lp-input max-w-xs">
                <option value="log">{{ t('adminSystem.emailModeLog') }}</option>
                <option value="smtp">{{ t('adminSystem.emailModeSmtp') }}</option>
              </select>
            </label>
            <label class="lp-label">
              {{ t('adminSystem.emailFrom') }}
              <input v-model.trim="config.email.from" class="lp-input" type="text" />
            </label>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <label class="lp-label">
                {{ t('adminSystem.smtpHost') }}
                <input v-model.trim="config.email.smtpHost" class="lp-input" type="text" />
              </label>
              <label class="lp-label">
                {{ t('adminSystem.smtpPort') }}
                <input v-model.number="config.email.smtpPort" class="lp-input" type="number" min="1" />
              </label>
            </div>
            <label class="lp-label">
              {{ t('adminSystem.smtpUsername') }}
              <input v-model.trim="config.email.smtpUsername" class="lp-input" type="text" />
            </label>
            <label class="lp-label">
              {{ t('adminSystem.smtpPassword') }}
              <div class="flex flex-wrap items-center gap-2">
                <input v-model="config.email.smtpPassword" class="lp-input w-full max-w-sm" type="password" autocomplete="new-password" />
                <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                  {{ config.email.smtpPasswordSet ? t('adminSystem.secretSet') : t('adminSystem.secretNotSet') }}
                </span>
              </div>
            </label>
            <label class="lp-label">
              {{ t('adminSystem.emailCodeSecret') }}
              <div class="flex flex-wrap items-center gap-2">
                <input v-model="config.email.codeSecret" class="lp-input w-full max-w-sm" type="password" autocomplete="new-password" />
                <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                  {{ config.email.codeSecretSet ? t('adminSystem.secretSet') : t('adminSystem.secretNotSet') }}
                </span>
              </div>
            </label>
          </div>

          <div v-else-if="activeSection === 'auth'" class="grid max-w-3xl gap-3">
            <div v-for="item in [
              { label: t('adminSystem.smsEnabled') },
              { label: t('adminSystem.googleEnabled') },
              { label: t('adminSystem.wechatEnabled') }
            ]" :key="item.label" class="rounded-lg border border-slate-200 bg-white p-3">
              <div class="flex flex-wrap items-center gap-2">
                <input :checked="false" type="checkbox" class="size-4 accent-teal-700 disabled:cursor-not-allowed disabled:opacity-60" disabled />
                <strong class="text-sm text-slate-950">{{ item.label }}</strong>
                <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                  {{ t('adminSystem.reservedDisabled') }}
                </span>
              </div>
              <p class="m-0 mt-2 text-xs font-medium text-slate-500">
                {{ t('adminSystem.reservedLoginUnavailable') }}
              </p>
            </div>
          </div>

          <div v-else class="grid max-w-3xl gap-4">
            <label class="lp-label">
              {{ t('adminSystem.maxDevices') }}
              <input v-model.number="config.maxDevicesPerAccount" class="lp-input max-w-xs" type="number" min="1" />
            </label>
            <label class="lp-label">
              {{ t('adminSystem.maxStorageBytes') }}
              <input v-model.number="config.maxStorageBytes" class="lp-input max-w-xs" type="number" min="1" />
            </label>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
