<script setup lang="ts">
import { LogOut, ShieldAlert } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/i18n'
import { useSessionStore } from '@/stores/session'

const router = useRouter()
const session = useSessionStore()
const { t } = useI18n()

async function logout(): Promise<void> {
  await session.logout()
  await router.push('/login')
}
</script>

<template>
  <div class="grid min-h-screen place-items-center bg-[#f6f8f9] p-6 text-slate-950">
    <section class="grid w-full max-w-md gap-5 rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5">
      <div class="grid size-12 place-items-center rounded-lg bg-amber-50 text-amber-700">
        <ShieldAlert class="size-6" />
      </div>
      <div class="grid gap-2">
        <h1 class="m-0 text-2xl font-black">{{ t('auth.adminRequired') }}</h1>
        <p class="m-0 text-sm leading-6 text-slate-600">{{ t('auth.adminRequiredBody') }}</p>
      </div>
      <button class="lp-button-primary justify-self-start" type="button" @click="logout">
        <LogOut class="size-4" />
        {{ t('layout.logout') }}
      </button>
    </section>
  </div>
</template>
