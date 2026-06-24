<script setup lang="ts">
import {
  ChevronDown,
  LogOut,
  ScrollText,
  ServerCog,
  Settings,
  TableProperties,
  Users
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ToastHost from '@/components/ToastHost.vue'
import { t, useI18n, type AdminWebLocale } from '@/i18n'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const { locale, setLocale, supportedLocales } = useI18n()
const toast = ref<string | null>(null)
const accountMenuOpen = ref(false)
const accountMenuRef = ref<HTMLElement | null>(null)

const navGroups = computed(() => [
  {
    label: t('layout.adminConsole'),
    items: [
      { to: '/admin/accounts', label: t('layout.accounts'), ariaLabel: t('layout.adminAccounts'), icon: Users },
      { to: '/admin/roles', label: t('layout.roles'), ariaLabel: t('layout.adminRoles'), icon: Settings },
      { to: '/admin/data', label: t('layout.syncData'), ariaLabel: t('layout.adminSyncData'), icon: TableProperties },
      { to: '/admin/save-history', label: t('layout.syncEvents'), ariaLabel: t('layout.adminSyncEvents'), icon: ScrollText },
      { to: '/admin/system', label: t('layout.system'), ariaLabel: t('layout.adminSystem'), icon: Settings },
      { to: '/admin/audit', label: t('layout.audit'), ariaLabel: t('layout.adminAudit'), icon: ScrollText }
    ]
  }
])

const pageTitle = computed(() => {
  if (route.meta.titleKey) return t(route.meta.titleKey)
  const item = navGroups.value.flatMap((group) => group.items).find((entry) => route.path === entry.to)
  return item?.label ?? t('common.productName')
})

const accountDisplayName = computed(() => session.account?.displayName || session.account?.email || t('common.account'))
const accountEmail = computed(() => session.account?.email ?? '')

onMounted(async () => {
  document.addEventListener('pointerdown', closeAccountMenuOnOutsideClick)
  await session.refreshHealth().catch(() => undefined)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeAccountMenuOnOutsideClick)
})

async function logout() {
  accountMenuOpen.value = false
  await session.logout()
  await router.push('/login')
}

function closeAccountMenuOnOutsideClick(event: PointerEvent) {
  if (!accountMenuOpen.value) return
  if (accountMenuRef.value?.contains(event.target as Node)) return
  accountMenuOpen.value = false
}

function showToast(message: string) {
  toast.value = message
  window.setTimeout(() => {
    toast.value = null
  }, 1800)
}
</script>

<template>
  <div class="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside class="flex min-h-0 flex-col border-b border-slate-200 bg-[#eef4f2] lg:border-b-0 lg:border-r">
      <div class="grid grid-cols-[36px_minmax(0,1fr)] items-center gap-3 border-b border-slate-200 p-4">
        <div class="grid size-9 place-items-center rounded-lg bg-slate-950 text-white">
          <ServerCog class="size-5" />
        </div>
        <div>
          <strong class="block text-sm text-slate-950">{{ t('common.productName') }}</strong>
          <small class="text-xs font-semibold text-slate-500">{{ t('common.serverWeb') }}</small>
        </div>
      </div>

      <nav class="grid gap-4 p-3 sm:grid-cols-2 lg:grid-cols-1">
        <div v-for="group in navGroups" :key="group.label" class="grid gap-1">
          <div class="px-2 py-1 text-xs font-black text-slate-500">{{ group.label }}</div>
          <RouterLink
            v-for="item in group.items"
            :key="item.to"
            :to="item.to"
            :aria-label="item.ariaLabel"
            class="grid h-10 grid-cols-[20px_minmax(0,1fr)] items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-white hover:text-slate-950"
            active-class="bg-white text-teal-700 shadow-sm shadow-slate-900/5"
          >
            <component :is="item.icon" class="size-4" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </div>
      </nav>
    </aside>

    <main class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] lg:min-h-screen">
      <header class="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-5 py-2">
        <h1 class="m-0 text-lg font-black">{{ pageTitle }}</h1>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
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
          <div ref="accountMenuRef" class="relative">
            <button
              class="flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 hover:bg-slate-50"
              type="button"
              :aria-expanded="accountMenuOpen"
              :aria-label="t('layout.accountMenu')"
              @click.stop="accountMenuOpen = !accountMenuOpen"
              @keydown.esc="accountMenuOpen = false"
            >
              <UserCircle class="size-4 shrink-0 text-slate-500" />
              <span class="truncate">{{ accountDisplayName }}</span>
              <ChevronDown class="size-4 shrink-0 text-slate-400" />
            </button>

            <div
              v-if="accountMenuOpen"
              class="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg shadow-slate-900/10"
            >
              <div class="border-b border-slate-100 px-4 py-3">
                <strong class="block truncate text-sm text-slate-950">{{ accountDisplayName }}</strong>
                <small v-if="accountEmail" class="mt-1 block truncate text-xs font-semibold text-slate-500">{{ accountEmail }}</small>
              </div>
              <button
                class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-slate-700 hover:bg-slate-50"
                type="button"
                @click="logout"
              >
                <LogOut class="size-4 text-slate-500" />
                {{ t('layout.logout') }}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div class="min-h-0 overflow-auto p-3 sm:p-5">
        <RouterView />
      </div>
    </main>
  </div>
  <ToastHost :message="toast" />
</template>
