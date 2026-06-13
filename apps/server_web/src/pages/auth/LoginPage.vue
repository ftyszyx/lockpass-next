<script setup lang="ts">
import { Mail, ServerCog, ShieldCheck } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/api/client'
import { useI18n, type ServerWebLocale } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { AuthResponse } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { locale, setLocale, supportedLocales, t } = useI18n()

const mode = ref<'login' | 'register'>('login')
const email = ref('')
const password = ref('')
const displayName = ref('')
const submitting = ref(false)
const desktopBindError = ref('')
const desktopBind = computed(() => route.query.desktopBind === '1')
const desktopDeviceName = computed(() => String(route.query.deviceName || t('auth.defaultDesktopDeviceName')))
const desktopClientDeviceId = computed(() => String(route.query.clientDeviceId || ''))
const desktopMode = computed(() => route.query.mode === 'official' ? 'official' : 'selfhost')
const desktopServerUrl = computed(() => String(route.query.serverUrl || import.meta.env.VITE_LOCKPASS_API_BASE_URL || 'http://127.0.0.1:1480'))

onMounted(() => {
  session.refreshHealth().catch(() => undefined)
  if (desktopBind.value && session.token) {
    void bindCurrentSessionToDesktop()
  }
})

async function submit() {
  submitting.value = true
  desktopBindError.value = ''
  try {
    let auth: AuthResponse
    if (mode.value === 'login') {
      auth = await session.login(email.value, password.value)
    } else {
      auth = await session.register(email.value, password.value, displayName.value)
    }
    if (desktopBind.value) {
      await completeDesktopBind(auth.token)
      return
    }
    await router.push(String(route.query.redirect || '/console'))
  } finally {
    submitting.value = false
  }
}

async function bindCurrentSessionToDesktop(): Promise<void> {
  if (!session.token) return
  submitting.value = true
  desktopBindError.value = ''
  try {
    await completeDesktopBind(session.token)
  } catch (error) {
    desktopBindError.value = userFacingErrorMessage(error)
  } finally {
    submitting.value = false
  }
}

async function completeDesktopBind(token: string): Promise<void> {
  await bindDesktopDevice(token)
  await router.replace(String(route.query.redirect || '/console'))
}

async function bindDesktopDevice(token: string): Promise<void> {
  const exchange = await api.bindDevice(token, desktopDeviceName.value, desktopClientDeviceId.value || undefined)
  const payload = base64UrlEncode(JSON.stringify({
    mode: desktopMode.value,
    serverUrl: desktopServerUrl.value,
    account: exchange.account,
    device: exchange.device,
    deviceToken: exchange.deviceToken,
    tokenType: exchange.tokenType
  }))
  window.location.href = `lockpass://auth/callback?payload=${encodeURIComponent(payload)}`
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 bg-[#f6f8f9] lg:grid-cols-[minmax(0,1fr)_430px]">
    <section class="grid content-start gap-6 p-6 sm:p-8 lg:p-10">
      <div class="flex items-center gap-3">
        <div class="grid size-10 place-items-center rounded-lg bg-slate-950 text-white">
          <ServerCog class="size-5" />
        </div>
        <div>
          <strong class="block text-lg">{{ t('common.productName') }}</strong>
          <small class="font-semibold text-slate-500">{{ t('auth.subtitle') }}</small>
        </div>
      </div>

      <div class="max-w-3xl pt-4 lg:pt-12">
        <h1 class="m-0 text-3xl font-black tracking-normal text-slate-950 sm:text-4xl">{{ t('auth.heroTitle') }}</h1>
      </div>

      <div class="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="lp-panel p-4">
          <ShieldCheck class="mb-3 size-5 text-teal-700" />
          <strong class="block text-sm">{{ t('auth.endToEndTitle') }}</strong>
          <small class="text-slate-500">{{ t('auth.endToEndBody') }}</small>
        </div>
        <div class="lp-panel p-4">
          <Mail class="mb-3 size-5 text-teal-700" />
          <strong class="block text-sm">{{ t('auth.accountTitle') }}</strong>
          <small class="text-slate-500">{{ t('auth.accountBody') }}</small>
        </div>
        <div class="lp-panel p-4">
          <ServerCog class="mb-3 size-5 text-teal-700" />
          <strong class="block text-sm">{{ t('auth.selfHostedTitle') }}</strong>
          <small class="text-slate-500">{{ t('auth.selfHostedBody') }}</small>
        </div>
      </div>
    </section>

    <aside class="grid content-center border-t border-slate-200 bg-white p-6 sm:p-8 lg:border-l lg:border-t-0">
      <div class="grid gap-4">
        <div class="flex items-center justify-between">
          <h2 class="m-0 text-xl font-black">{{ mode === 'login' ? t('auth.login') : t('auth.register') }}</h2>
          <select
            class="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700"
            :aria-label="t('common.language')"
            :value="locale"
            @change="setLocale(($event.target as HTMLSelectElement).value as ServerWebLocale)"
          >
            <option v-for="item in supportedLocales" :key="item" :value="item">
              {{ item === 'zh-CN' ? t('localeNames.zhCN') : t('localeNames.enUS') }}
            </option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            class="h-9 rounded-md text-sm font-bold"
            :class="mode === 'login' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'"
            @click="mode = 'login'"
          >
            {{ t('auth.login') }}
          </button>
          <button
            type="button"
            class="h-9 rounded-md text-sm font-bold"
            :class="mode === 'register' ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'"
            @click="mode = 'register'"
          >
            {{ t('auth.register') }}
          </button>
        </div>

        <form class="grid gap-3" @submit.prevent="submit">
          <label v-if="mode === 'register'" class="lp-label">
            {{ t('auth.displayName') }}
            <input v-model="displayName" class="lp-input" autocomplete="name" required />
          </label>
          <label class="lp-label">
            {{ t('auth.email') }}
            <input v-model="email" class="lp-input" autocomplete="email" required type="email" />
          </label>
          <label class="lp-label">
            {{ t('auth.password') }}
            <input v-model="password" class="lp-input" autocomplete="current-password" required type="password" minlength="8" />
          </label>

          <p v-if="session.error || desktopBindError" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {{ session.error || desktopBindError }}
          </p>

          <button class="lp-button-primary" type="submit" :disabled="submitting">
            {{ submitting ? t('common.processing') : mode === 'login' ? t('auth.login') : t('auth.createAccount') }}
          </button>
        </form>

        <div class="grid gap-2 border-t border-slate-200 pt-4">
          <button class="lp-button" type="button" disabled>{{ t('auth.smsLogin') }}</button>
          <button class="lp-button" type="button" disabled>{{ t('auth.googleLogin') }}</button>
          <button class="lp-button" type="button" disabled>{{ t('auth.wechatLogin') }}</button>
        </div>
      </div>
    </aside>
  </div>
</template>
