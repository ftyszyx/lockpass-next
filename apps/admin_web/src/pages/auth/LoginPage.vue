<script setup lang="ts">
import { KeyRound, Mail, ServerCog, ShieldCheck } from '@lucide/vue'
import { PasswordInput } from '@lockpass/ui'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n, type AdminWebLocale } from '@/i18n'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { locale, setLocale, supportedLocales, t } = useI18n()

const username = ref('')
const password = ref('')
const submitting = ref(false)

onMounted(() => {
  session.refreshHealth().catch(() => undefined)
})

async function submit() {
  submitting.value = true
  try {
    await session.adminLogin(username.value, password.value)
    await router.push(String(route.query.redirect || '/admin/accounts'))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 bg-[#f6f8f9] lg:grid-cols-[minmax(0,1fr)_430px]">
    <section class="grid content-start gap-6 p-6 sm:p-8 lg:p-10">
      <div class="flex items-center gap-3">
        <img class="size-10 object-contain" src="/favicon.svg" alt="" />
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
          <h2 class="m-0 text-xl font-black">{{ t('auth.login') }}</h2>
          <select
            class="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-slate-700"
            :aria-label="t('common.language')"
            :value="locale"
            @change="setLocale(($event.target as HTMLSelectElement).value as AdminWebLocale)"
          >
            <option v-for="item in supportedLocales" :key="item" :value="item">
              {{ item === 'zh-CN' ? t('localeNames.zhCN') : t('localeNames.enUS') }}
            </option>
          </select>
        </div>

        <form class="grid gap-3" @submit.prevent="submit">
          <label class="lp-label">
            {{ t('auth.username') }}
            <input v-model="username" class="lp-input" autocomplete="username" required />
          </label>
          <label class="lp-label">
            {{ t('auth.password') }}
            <PasswordInput
              v-model="password"
              class="lp-input"
              autocomplete="current-password"
              required
              :show-label="t('common.showPassword')"
              :hide-label="t('common.hidePassword')"
            />
          </label>

          <p v-if="session.error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {{ session.error }}
          </p>

          <button class="lp-button-primary" type="submit" :disabled="submitting">
            <KeyRound class="size-4" />
            {{ submitting ? t('common.processing') : t('auth.login') }}
          </button>
        </form>
      </div>
    </aside>
  </div>
</template>
