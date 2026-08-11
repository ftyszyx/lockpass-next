<script setup lang="ts">
import { Cloud, Download, KeyRound, LogIn, ShieldCheck } from '@lucide/vue'
import { PasswordInput } from '@lockpass/ui'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { desktopMessages, localeLabels, setI18nLocale, supportedLocales, type SupportedLocale } from '@/i18n'
import { configuredOfficialApiUrl } from '@/services/appConfig'
import { createInitialServerVault } from '@/services/accountBootstrap'
import { saveWebLocale } from '@/services/locale'
import { generateSecretKey } from '@/services/masterPassword'
import type { SyncDeviceBindCallbackPayload, SyncDeviceBindResponse, SyncMode } from '@/services/syncClient'
import { useVaultStore } from '@/stores/vault'
import { WebApiError } from '../api/client'
import { useWebSessionStore } from '../stores/webSession'

type AuthMode = 'login' | 'register'
type AuthStep = 'email' | 'code' | 'unlockVault' | 'masterPassword' | 'generateSecretKey' | 'backupSecretKey'

const route = useRoute()
const router = useRouter()
const session = useWebSessionStore()
const vaultStore = useVaultStore()
const { locale, t } = useI18n()

const mode = ref<AuthMode>('login')
const step = ref<AuthStep>('email')
const email = ref('')
const code = ref('')
const displayName = ref('')
const challengeId = ref('')
const accountSetupToken = ref('')
const masterPassword = ref('')
const confirmMasterPassword = ref('')
const secretKey = ref('')
const secretKeyGeneratedAt = ref('')
const error = ref('')
const busy = ref(false)
const finalizingSetup = ref(false)
const completedAccountExchange = ref<SyncDeviceBindResponse | null>(null)
const pendingWebBinding = ref<SyncDeviceBindCallbackPayload | null>(null)

const desktopBind = computed(() => route.query.desktopBind === '1')
const extensionBind = computed(() => route.query.extensionBind === '1')
const externalBind = computed(() => desktopBind.value || extensionBind.value)
const bindMode = computed<SyncMode>(() => route.query.mode === 'selfhost' ? 'selfhost' : 'official')
const bindServerUrl = computed(() => String(route.query.serverUrl || configuredOfficialApiUrl()))
const bindingDeviceName = computed(() => String(
  route.query.deviceName || t(extensionBind.value ? 'webAuth.defaultExtensionDeviceName' : 'webAuth.defaultDesktopDeviceName')
))
const bindingClientDeviceId = computed(() => String(route.query.clientDeviceId || ''))
const isRegisterPasswordStep = computed(() => mode.value === 'register' && step.value === 'masterPassword')
const isRegisterSecretStep = computed(() => mode.value === 'register' && (step.value === 'generateSecretKey' || step.value === 'backupSecretKey'))
const submitting = computed(() => session.loading || busy.value)
const backupAccountLabel = computed(() => email.value || displayName.value || 'LockPass')
const secretKeyCreatedAtLabel = computed(() => {
  if (!secretKeyGeneratedAt.value) return ''
  return new Intl.DateTimeFormat(locale.value, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(secretKeyGeneratedAt.value))
})

onMounted(async () => {
  if (route.query.authMode === 'register') {
    mode.value = 'register'
  }
  await session.restore()
  if (externalBind.value && session.token && mode.value === 'login') {
    await completeExternalBind()
  }
})

async function submit(): Promise<void> {
  if (submitting.value) return
  error.value = ''
  session.error = ''
  busy.value = true
  try {
    if (step.value === 'email') {
      const challenge = await session.startEmail(email.value, mode.value, mode.value === 'register' ? displayName.value : undefined)
      challengeId.value = challenge.challengeId
      code.value = ''
      step.value = 'code'
      return
    }

    if (step.value === 'code') {
      if (!/^\d{6}$/.test(code.value.trim())) {
        error.value = t('webAuth.emailCodeInvalid')
        return
      }
      const verified = await session.verifyEmail(challengeId.value, code.value)
      if (mode.value === 'register') {
        accountSetupToken.value = verified.accountSetupToken
        step.value = 'masterPassword'
        return
      }

      await session.completeEmailLogin(verified.accountSetupToken)
      if (externalBind.value) {
        await completeExternalBind()
        return
      }
      await prepareWebVaultUnlock()
      return
    }

    if (step.value === 'unlockVault') {
      const validationError = validateExistingVaultUnlock()
      if (validationError) {
        error.value = validationError
        return
      }
      await completeWebVaultUnlock()
      return
    }

    if (step.value === 'masterPassword') {
      const validationError = validateMasterPassword()
      if (validationError) {
        error.value = validationError
        return
      }
      step.value = 'generateSecretKey'
      return
    }

    if (step.value === 'generateSecretKey') {
      secretKey.value = generateSecretKey()
      secretKeyGeneratedAt.value = new Date().toISOString()
      step.value = 'backupSecretKey'
      return
    }

    if (step.value === 'backupSecretKey') {
      if (!secretKey.value) {
        step.value = 'generateSecretKey'
        error.value = t('webAuth.secretKeyMissing')
        return
      }
      const bindingMode = externalBind.value ? bindMode.value : 'official'
      const serverUrl = externalBind.value ? bindServerUrl.value : configuredOfficialApiUrl()
      const deviceName = externalBind.value ? bindingDeviceName.value : t('webAuth.defaultWebDeviceName')
      const clientDeviceId = externalBind.value ? bindingClientDeviceId.value || undefined : webClientDeviceId()
      const exchange = completedAccountExchange.value ?? await session.completeAccount({
        setupToken: accountSetupToken.value,
        mode: bindingMode,
        serverUrl,
        deviceName,
        clientDeviceId
      })
      completedAccountExchange.value = exchange
      const binding = session.rememberDeviceBinding(bindingMode, serverUrl, exchange)
      const initialVault = await createInitialServerVault({
        binding,
        masterPassword: masterPassword.value,
        secretKey: secretKey.value,
        defaultVaultName: desktopMessages[locale.value as SupportedLocale].vault.defaultName,
        defaultVaultDescription: desktopMessages[locale.value as SupportedLocale].vault.defaultDescription
      })
      if (!externalBind.value) {
        if (!vaultStore.hydrated) {
          await vaultStore.hydrate()
        }
        await vaultStore.createServerBackedUser({
          exchange: binding,
          password: masterPassword.value,
          secretKey: secretKey.value,
          initialVault
        })
      }
      finalizingSetup.value = true
      if (externalBind.value) {
        redirectExternalBinding(binding)
        clearSecretInputs({ keepFinalizing: true })
        return
      }
      await router.replace(String(route.query.redirect || '/vault'))
      clearSecretInputs()
    }
  } catch (cause) {
    finalizingSetup.value = false
    error.value = authErrorMessage(cause)
  } finally {
    busy.value = false
  }
}

function validateExistingVaultUnlock(): string {
  if (!masterPassword.value) return t('webAuth.masterPasswordRequired')
  if (!secretKey.value.trim()) return t('unlock.secretKeyRequired')
  return ''
}

function validateMasterPassword(): string {
  if (masterPassword.value.length < 8) return t('webAuth.passwordTooShort')
  if (masterPassword.value !== confirmMasterPassword.value) return t('webAuth.passwordMismatch')
  return ''
}

function resetCodeStep(): void {
  step.value = 'email'
  code.value = ''
  challengeId.value = ''
  accountSetupToken.value = ''
  completedAccountExchange.value = null
  pendingWebBinding.value = null
  clearSecretInputs()
}

function switchMode(nextMode: AuthMode): void {
  mode.value = nextMode
  resetCodeStep()
}

function clearSecretInputs(options: { keepFinalizing?: boolean } = {}): void {
  masterPassword.value = ''
  confirmMasterPassword.value = ''
  secretKey.value = ''
  secretKeyGeneratedAt.value = ''
  if (!options.keepFinalizing) {
    finalizingSetup.value = false
  }
}

function authErrorMessage(cause: unknown): string {
  if (cause instanceof WebApiError) {
    if (mode.value === 'register') {
      if (cause.errorCode === 'conflict' || cause.status === 409) return t('webAuth.registerConflict')
      if (cause.errorCode === 'forbidden' || cause.status === 403) return t('webAuth.registerDisabled')
      if (cause.errorCode === 'bad_request' || cause.status === 400) return t('webAuth.registerInvalid')
      if (cause.status >= 500) return t('webAuth.serverUnavailable')
    }
    if (cause.status >= 500) return t('webAuth.serverUnavailable')
    return mode.value === 'login' ? t('webAuth.loginFailed') : t('webAuth.registerFailed')
  }

  if (cause instanceof TypeError) return t('webAuth.networkFailed')
  if (cause instanceof Error) {
    if (cause.message === 'syncNetworkBlocked') return t('webAuth.networkFailed')
    if (cause.message === 'extensionCallbackInvalid') return t('webAuth.extensionCallbackInvalid')
    if (cause.message === 'initialVaultUploadFailed') return t('webAuth.initialVaultUploadFailed')
    if (cause.message === 'syncUnsupportedId') return t('sync.syncUnsupportedId')
    if (cause.message === 'syncNotConnected') return t('sync.syncNotConnected')
    if (cause.message === 'serverVaultKeyMissing') return t('user.serverVaultKeyMissing')
    if (cause.message === 'duplicate-username') return t('user.duplicateUsername')
    if (step.value === 'unlockVault') return t('user.wrongUnlockSecret')
  }
  return mode.value === 'login' ? t('webAuth.loginFailed') : t('webAuth.registerFailed')
}

async function prepareWebVaultUnlock(): Promise<void> {
  pendingWebBinding.value = await session.bindWebDevice({
    mode: 'official',
    serverUrl: configuredOfficialApiUrl(),
    deviceName: t('webAuth.defaultWebDeviceName'),
    clientDeviceId: webClientDeviceId()
  })
  clearSecretInputs()
  step.value = 'unlockVault'
}

async function completeWebVaultUnlock(): Promise<void> {
  const binding = pendingWebBinding.value ?? session.deviceBinding
  if (!binding) throw new Error('syncNotConnected')
  if (!vaultStore.hydrated) {
    await vaultStore.hydrate()
  }
  await vaultStore.restoreServerAccount({
    exchange: binding,
    password: masterPassword.value,
    secretKey: secretKey.value.trim()
  })
  pendingWebBinding.value = null
  await router.replace(String(route.query.redirect || '/vault'))
  clearSecretInputs()
}

async function completeExternalBind(): Promise<void> {
  const binding = await session.bindWebDevice({
    mode: bindMode.value,
    serverUrl: bindServerUrl.value,
    deviceName: bindingDeviceName.value,
    clientDeviceId: bindingClientDeviceId.value || undefined
  })
  redirectExternalBinding(binding)
}

function redirectExternalBinding(binding: SyncDeviceBindCallbackPayload): void {
  const payload = base64UrlEncode(JSON.stringify(binding))
  if (extensionBind.value) {
    const redirectUrl = validatedExtensionRedirectUrl()
    redirectUrl.searchParams.set('payload', payload)
    window.location.replace(redirectUrl.toString())
    return
  }
  window.location.href = `lockpass://auth/callback?payload=${encodeURIComponent(payload)}`
}

function validatedExtensionRedirectUrl(): URL {
  const redirectUrl = new URL(String(route.query.redirectUri || ''))
  if (
    redirectUrl.protocol !== 'https:' ||
    !/^[a-p]{32}\.chromiumapp\.org$/.test(redirectUrl.hostname) ||
    redirectUrl.pathname !== '/auth/callback'
  ) {
    throw new Error('extensionCallbackInvalid')
  }
  return redirectUrl
}

function webClientDeviceId(): string {
  const storageKey = 'lockpass.web.clientDeviceId'
  const existing = localStorage.getItem(storageKey)
  if (existing) return existing
  const next = `web-${crypto.randomUUID()}`
  localStorage.setItem(storageKey, next)
  return next
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function saveSecretKeyPdf(): void {
  window.print()
}

function changeLocale(event: Event): void {
  const nextLocale = (event.target as HTMLSelectElement).value as SupportedLocale
  setI18nLocale(nextLocale)
  saveWebLocale(nextLocale)
}
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 bg-[#f6f8f9] text-slate-950 lg:grid-cols-[minmax(0,1fr)_430px]">
    <section class="grid content-start gap-6 p-6 sm:p-8 lg:p-10">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="grid size-10 place-items-center rounded-lg bg-slate-950 text-white">
            <KeyRound class="size-5" />
          </div>
          <div>
            <strong class="block text-lg">LockPass</strong>
            <small class="font-semibold text-slate-500">{{ t('webAuth.subtitle') }}</small>
          </div>
        </div>
        <select
          class="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700"
          :aria-label="t('settings.language')"
          :value="locale"
          @change="changeLocale"
        >
          <option v-for="item in supportedLocales" :key="item" :value="item">
            {{ localeLabels[item] }}
          </option>
        </select>
      </div>

      <div class="max-w-3xl pt-4 lg:pt-12">
        <h1 class="m-0 text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">{{ t('webAuth.title') }}</h1>
        <p class="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
          {{ extensionBind ? t('webAuth.extensionBindBody') : desktopBind ? t('webAuth.desktopBindBody') : t('webAuth.body') }}
        </p>
      </div>

      <div class="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <ShieldCheck class="mb-3 size-5 text-teal-700" />
          <strong class="block text-sm">{{ t('sync.secretKeyNotice') }}</strong>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <Cloud class="mb-3 size-5 text-teal-700" />
          <strong class="block text-sm">{{ t('sync.syncedTitle') }}</strong>
        </div>
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <KeyRound class="mb-3 size-5 text-teal-700" />
          <strong class="block text-sm">{{ t('user.masterPassword') }}</strong>
        </div>
      </div>
    </section>

    <aside class="grid content-center border-t border-slate-200 bg-white p-6 sm:p-8 lg:border-l lg:border-t-0">
      <div class="grid gap-4">
        <div class="flex items-center justify-between">
          <h2 class="m-0 text-xl font-black">
            <template v-if="isRegisterPasswordStep">{{ t('webAuth.setMasterPasswordTitle') }}</template>
            <template v-else-if="step === 'unlockVault'">{{ t('webAuth.unlockVaultTitle') }}</template>
            <template v-else-if="step === 'generateSecretKey'">{{ t('webAuth.generateSecretKeyTitle') }}</template>
            <template v-else-if="step === 'backupSecretKey'">{{ t('webAuth.backupSecretKeyTitle') }}</template>
            <template v-else-if="step === 'code'">{{ t('webAuth.verifyEmailTitle') }}</template>
            <template v-else>{{ mode === 'login' ? t('webAuth.login') : t('webAuth.register') }}</template>
          </h2>
        </div>

        <div v-if="!isRegisterPasswordStep && !isRegisterSecretStep && step !== 'unlockVault'" class="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            class="h-9 rounded-md text-sm font-bold"
            :class="mode === 'login' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'"
            @click="switchMode('login')"
          >
            {{ t('webAuth.login') }}
          </button>
          <button
            type="button"
            class="h-9 rounded-md text-sm font-bold"
            :class="mode === 'register' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'"
            @click="switchMode('register')"
          >
            {{ t('webAuth.register') }}
          </button>
        </div>

        <form class="grid gap-3" @submit.prevent="submit">
          <template v-if="step === 'email'">
            <label v-if="mode === 'register'" class="form-label">
              {{ t('webAuth.displayName') }}
              <input v-model="displayName" class="form-input" autocomplete="name" required />
            </label>
            <label class="form-label">
              {{ t('webAuth.email') }}
              <input v-model="email" class="form-input" autocomplete="email" required type="email" />
            </label>
          </template>

          <template v-else-if="step === 'code'">
            <p class="m-0 text-sm leading-6 text-slate-600">
              {{ t('webAuth.verifyEmailBody', { email }) }}
            </p>
            <label class="form-label">
              {{ t('webAuth.emailCode') }}
              <input v-model="code" class="form-input text-2xl font-bold tracking-[0.18em]" autocomplete="one-time-code" inputmode="numeric" maxlength="6" minlength="6" required />
            </label>
          </template>

          <template v-else-if="step === 'unlockVault'">
            <p class="m-0 text-sm leading-6 text-slate-600">{{ t('webAuth.unlockVaultBody') }}</p>
            <label class="form-label">
              {{ t('user.masterPassword') }}
              <PasswordInput
                v-model="masterPassword"
                class="form-input"
                autocomplete="current-password"
                required
                :show-label="t('user.showPassword')"
                :hide-label="t('user.hidePassword')"
              />
            </label>
            <label class="form-label">
              {{ t('user.secretKey') }}
              <input v-model="secretKey" class="form-input font-mono" autocomplete="off" required />
            </label>
          </template>

          <template v-else-if="step === 'masterPassword'">
            <p class="m-0 text-sm leading-6 text-slate-600">{{ t('webAuth.setMasterPasswordBody') }}</p>
            <label class="form-label">
              {{ t('user.masterPassword') }}
              <PasswordInput
                v-model="masterPassword"
                class="form-input"
                autocomplete="new-password"
                required
                :show-label="t('user.showPassword')"
                :hide-label="t('user.hidePassword')"
              />
            </label>
            <label class="form-label">
              {{ t('user.confirmPassword') }}
              <PasswordInput
                v-model="confirmMasterPassword"
                class="form-input"
                autocomplete="new-password"
                required
                :show-label="t('user.showPassword')"
                :hide-label="t('user.hidePassword')"
              />
            </label>
            <p class="m-0 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
              {{ t('webAuth.masterPasswordResetNotice') }}
            </p>
          </template>

          <template v-else-if="step === 'generateSecretKey'">
            <p class="m-0 text-sm leading-6 text-slate-600">{{ t('webAuth.generateSecretKeyBody') }}</p>
          </template>

          <template v-else-if="step === 'backupSecretKey'">
            <p v-if="finalizingSetup" class="m-0 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900">
              {{ t('webAuth.finishingSetup') }}
            </p>
            <template v-else>
              <div class="grid gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                <span class="text-xs font-black uppercase tracking-wide text-slate-500">{{ t('user.secretKey') }}</span>
                <strong class="break-all font-mono text-lg leading-8 text-slate-950">{{ secretKey }}</strong>
              </div>
              <button class="primary-button justify-center" type="button" :disabled="submitting" @click="saveSecretKeyPdf">
                <Download class="size-4" />
                {{ t('webAuth.saveSecretKeyPdf') }}
              </button>
              <p class="m-0 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900">
                {{ t('webAuth.backupSecretKeyNotice') }}
              </p>
            </template>
          </template>

          <p v-if="error || session.error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {{ error || session.error }}
          </p>

          <button v-if="!finalizingSetup" class="primary-button justify-center" type="submit" :disabled="submitting">
            <LogIn class="size-4" />
            {{
              submitting
                ? t('app.loading')
                : step === 'email'
                  ? t('webAuth.sendEmailCode')
                  : step === 'code'
                      ? mode === 'login'
                        ? t('webAuth.login')
                        : t('webAuth.next')
                    : step === 'unlockVault'
                      ? t('webAuth.unlockVault')
                    : step === 'masterPassword'
                      ? t('webAuth.createAccount')
                      : step === 'generateSecretKey'
                        ? t('webAuth.generateSecretKey')
                        : t('webAuth.completeAccountAfterBackup')
            }}
          </button>
          <button v-if="step === 'code'" class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700" type="button" :disabled="submitting" @click="resetCodeStep">
            {{ t('webAuth.changeEmail') }}
          </button>
        </form>
      </div>
    </aside>

    <section v-if="secretKey && !finalizingSetup" class="secret-key-print" aria-hidden="true">
      <div class="print-sheet">
        <p class="print-brand">LockPass</p>
        <h1>{{ t('webAuth.secretKeyPdfTitle') }}</h1>
        <dl>
          <div>
            <dt>{{ t('webAuth.secretKeyPdfAccount') }}</dt>
            <dd>{{ backupAccountLabel }}</dd>
          </div>
          <div>
            <dt>{{ t('webAuth.secretKeyPdfCreatedAt') }}</dt>
            <dd>{{ secretKeyCreatedAtLabel }}</dd>
          </div>
        </dl>
        <div class="print-secret">
          <span>{{ t('user.secretKey') }}</span>
          <strong>{{ secretKey }}</strong>
        </div>
        <p>{{ t('webAuth.secretKeyPdfNotice') }}</p>
      </div>
    </section>
  </div>
</template>

<style>
.secret-key-print {
  position: absolute;
  left: -9999px;
  top: 0;
  width: 720px;
  background: #ffffff;
  color: #0f172a;
}

@media print {
  @page {
    margin: 18mm;
  }

  body {
    background: #ffffff !important;
  }

  body * {
    visibility: hidden !important;
  }

  .secret-key-print,
  .secret-key-print * {
    visibility: visible !important;
  }

  .secret-key-print {
    position: fixed !important;
    inset: 0 !important;
    left: 0 !important;
    top: 0 !important;
    width: auto !important;
    padding: 0 !important;
  }

  .print-sheet {
    display: grid;
    gap: 18px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  }

  .print-brand {
    margin: 0;
    font-size: 14px;
    font-weight: 900;
    color: #0f766e;
  }

  .print-sheet h1 {
    margin: 0;
    font-size: 26px;
    line-height: 1.2;
  }

  .print-sheet p {
    margin: 0;
    color: #334155;
    line-height: 1.7;
  }

  .print-sheet dl {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .print-sheet dl > div {
    display: grid;
    grid-template-columns: 96px 1fr;
    gap: 12px;
  }

  .print-sheet dt {
    color: #64748b;
    font-weight: 800;
  }

  .print-sheet dd {
    margin: 0;
    color: #0f172a;
    font-weight: 800;
  }

  .print-secret {
    display: grid;
    gap: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 18px;
  }

  .print-secret span {
    color: #64748b;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }

  .print-secret strong {
    overflow-wrap: anywhere;
    color: #0f172a;
    font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 20px;
    line-height: 1.7;
  }
}
</style>
