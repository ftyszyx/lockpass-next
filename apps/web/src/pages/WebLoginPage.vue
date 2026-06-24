<script setup lang="ts">
import { Cloud, KeyRound, LogIn, ShieldCheck } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { localeLabels, setI18nLocale, supportedLocales, type SupportedLocale } from '@/i18n'
import { configuredOfficialApiUrl } from '@/services/appConfig'
import { saveWebLocale } from '@/services/locale'
import type { SyncDeviceBindCallbackPayload, SyncMode } from '@/services/syncClient'
import { WebApiError } from '../api/client'
import { useWebSessionStore } from '../stores/webSession'

const route = useRoute()
const router = useRouter()
const session = useWebSessionStore()
const { locale, t } = useI18n()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const error = ref('')

const desktopBind = computed(() => route.query.desktopBind === '1')
const bindMode = computed<SyncMode>(() => route.query.mode === 'selfhost' ? 'selfhost' : 'official')
const bindServerUrl = computed(() => String(route.query.serverUrl || configuredOfficialApiUrl()))
const desktopDeviceName = computed(() => String(route.query.deviceName || t('webAuth.defaultDesktopDeviceName')))
const desktopClientDeviceId = computed(() => String(route.query.clientDeviceId || ''))

onMounted(async () => {
  await session.restore()
  if (desktopBind.value && session.token) {
    await completeDesktopBind()
  }
})

async function submit(): Promise<void> {
  error.value = ''
  try {
    if (mode.value === 'login') {
      await session.login(email.value, password.value)
    } else {
      await session.register(email.value, password.value, displayName.value)
    }

    if (desktopBind.value) {
      await completeDesktopBind()
      return
    }

    await completeWebSignIn()
  } catch (cause) {
    error.value = authErrorMessage(cause)
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
  return mode.value === 'login' ? t('webAuth.loginFailed') : t('webAuth.registerFailed')
}

async function completeWebSignIn(): Promise<void> {
  await session.bindWebDevice({
    mode: 'official',
    serverUrl: configuredOfficialApiUrl(),
    deviceName: t('webAuth.defaultWebDeviceName'),
    clientDeviceId: webClientDeviceId()
  })
  await router.push(String(route.query.redirect || '/vault'))
}

async function completeDesktopBind(): Promise<void> {
  const binding = await session.bindWebDevice({
    mode: bindMode.value,
    serverUrl: bindServerUrl.value,
    deviceName: desktopDeviceName.value,
    clientDeviceId: desktopClientDeviceId.value || undefined
  })
  window.location.href = `lockpass://auth/callback?payload=${encodeURIComponent(base64UrlEncode(JSON.stringify(binding)))}`
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
        <p class="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{{ desktopBind ? t('webAuth.desktopBindBody') : t('webAuth.body') }}</p>
      </div>

      <div class="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="rounded-lg border border-slate-200 bg-white p-4">
          <ShieldCheck class="mb-3 size-5 text-teal-700" />
          <strong class="block text-sm">{{ t('sync.recoveryKeyNotice') }}</strong>
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
          <h2 class="m-0 text-xl font-black">{{ mode === 'login' ? t('webAuth.login') : t('webAuth.register') }}</h2>
        </div>

        <div class="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            class="h-9 rounded-md text-sm font-bold"
            :class="mode === 'login' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'"
            @click="mode = 'login'"
          >
            {{ t('webAuth.login') }}
          </button>
          <button
            type="button"
            class="h-9 rounded-md text-sm font-bold"
            :class="mode === 'register' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'"
            @click="mode = 'register'"
          >
            {{ t('webAuth.register') }}
          </button>
        </div>

        <form class="grid gap-3" @submit.prevent="submit">
          <label v-if="mode === 'register'" class="form-label">
            {{ t('webAuth.displayName') }}
            <input v-model="displayName" class="form-input" autocomplete="name" required />
          </label>
          <label class="form-label">
            {{ t('webAuth.email') }}
            <input v-model="email" class="form-input" autocomplete="email" required type="email" />
          </label>
          <label class="form-label">
            {{ t('webAuth.password') }}
            <input v-model="password" class="form-input" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" required type="password" minlength="8" />
          </label>

          <p v-if="error || session.error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {{ error || session.error }}
          </p>

          <button class="primary-button justify-center" type="submit" :disabled="session.loading">
            <LogIn class="size-4" />
            {{ session.loading ? t('app.loading') : mode === 'login' ? t('webAuth.login') : t('webAuth.createAccount') }}
          </button>
        </form>
      </div>
    </aside>
  </div>
</template>
