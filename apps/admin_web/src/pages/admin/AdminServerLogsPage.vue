<script setup lang="ts">
import { ChevronLeft, ChevronRight, RefreshCw, Search } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api/client'
import EmptyState from '@/components/EmptyState.vue'
import StatusPill from '@/components/StatusPill.vue'
import { t, useI18n } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { AccountView, ServerLogLevel, ServerLogView } from '@/types'

const pageSize = 50
const session = useSessionStore()
const { locale } = useI18n()
const accounts = ref<AccountView[]>([])
const logs = ref<ServerLogView[]>([])
const level = ref<ServerLogLevel | ''>('')
const accountId = ref('')
const search = ref('')
const appliedSearch = ref('')
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const error = ref('')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const rangeStart = computed(() => (total.value === 0 ? 0 : (page.value - 1) * pageSize + 1))
const rangeEnd = computed(() => Math.min(page.value * pageSize, total.value))

onMounted(async () => {
  await Promise.all([loadAccounts(), loadLogs()])
})

async function loadAccounts() {
  if (!session.token) return
  try {
    accounts.value = await api.adminAccounts(session.token)
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  }
}

async function loadLogs() {
  if (!session.token) return
  loading.value = true
  error.value = ''
  try {
    const result = await api.serverLogs(session.token, {
      level: level.value || undefined,
      accountId: accountId.value || undefined,
      search: appliedSearch.value || undefined,
      page: page.value,
      pageSize
    })
    logs.value = result.logs
    total.value = result.total
    if (result.page !== page.value) page.value = result.page
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    loading.value = false
  }
}

async function applyFilters() {
  page.value = 1
  appliedSearch.value = search.value.trim()
  await loadLogs()
}

async function goToPage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return
  page.value = nextPage
  await loadLogs()
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.value)
}

function accountLabel(account: AccountView) {
  return account.email ? `${account.displayName} · ${account.email}` : account.displayName
}

function levelTone(value: ServerLogLevel) {
  if (value === 'error') return 'danger'
  if (value === 'warning') return 'warn'
  return 'ok'
}

function levelLabel(value: ServerLogLevel) {
  return t(`adminServerLogs.levels.${value}` as Parameters<typeof t>[0])
}
</script>

<template>
  <section class="lp-panel">
    <div class="lp-panel-head">
      <div class="min-w-0 py-3">
        <h2 class="m-0 text-base font-black">{{ t('adminServerLogs.title') }}</h2>
        <p class="m-0 mt-1 text-sm text-slate-500">{{ t('adminServerLogs.summary') }}</p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <StatusPill>{{ total }}</StatusPill>
        <button class="lp-button" type="button" :disabled="loading" @click="loadLogs">
          <RefreshCw class="size-4" />
          {{ t('common.refresh') }}
        </button>
      </div>
    </div>

    <div class="lp-panel-body">
      <form class="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[150px_minmax(0,1fr)_minmax(220px,1.5fr)_auto]" @submit.prevent="applyFilters">
        <select v-model="level" class="lp-input" :aria-label="t('adminServerLogs.level')">
          <option value="">{{ t('adminServerLogs.allLevels') }}</option>
          <option value="info">{{ t('adminServerLogs.levels.info') }}</option>
          <option value="warning">{{ t('adminServerLogs.levels.warning') }}</option>
          <option value="error">{{ t('adminServerLogs.levels.error') }}</option>
        </select>
        <select v-model="accountId" class="lp-input" :aria-label="t('adminServerLogs.account')">
          <option value="">{{ t('adminServerLogs.allAccounts') }}</option>
          <option v-for="account in accounts" :key="account.id" :value="account.id">
            {{ accountLabel(account) }}
          </option>
        </select>
        <div class="relative min-w-0">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input v-model="search" class="lp-input pl-9" :placeholder="t('adminServerLogs.searchPlaceholder')" />
        </div>
        <button class="lp-button-primary" type="submit" :disabled="loading">
          {{ t('adminServerLogs.apply') }}
        </button>
      </form>

      <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
      <EmptyState v-if="!loading && logs.length === 0" :title="t('adminServerLogs.noLogs')" />
      <div v-if="logs.length" class="lp-table-wrap">
        <table class="lp-table min-w-[1180px]">
          <thead>
            <tr>
              <th>{{ t('adminServerLogs.time') }}</th>
              <th>{{ t('adminServerLogs.level') }}</th>
              <th>{{ t('adminServerLogs.account') }}</th>
              <th>{{ t('adminServerLogs.request') }}</th>
              <th>{{ t('adminServerLogs.result') }}</th>
              <th>{{ t('adminServerLogs.duration') }}</th>
              <th>{{ t('adminServerLogs.clientIp') }}</th>
              <th>{{ t('adminServerLogs.message') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id">
              <td class="whitespace-nowrap text-slate-500">{{ formatDate(log.createdAt) }}</td>
              <td><StatusPill :tone="levelTone(log.level)">{{ levelLabel(log.level) }}</StatusPill></td>
              <td>
                <strong class="block">{{ log.accountDisplayName || t('adminServerLogs.unknownAccount') }}</strong>
                <small class="text-slate-500">{{ log.accountEmail || log.accountId || '-' }}</small>
              </td>
              <td>
                <strong class="font-mono text-xs">{{ log.method }} {{ log.path }}</strong>
                <small class="block font-mono text-slate-500">{{ log.requestId }}</small>
              </td>
              <td class="font-mono" :class="log.statusCode >= 500 ? 'text-rose-700' : log.statusCode >= 400 ? 'text-amber-700' : 'text-teal-700'">
                {{ log.statusCode }}
              </td>
              <td class="whitespace-nowrap">{{ log.durationMs }} ms</td>
              <td class="font-mono text-xs text-slate-500">{{ log.clientIp || '-' }}</td>
              <td class="max-w-[380px] break-words text-slate-600">{{ log.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="total" class="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
        <span>{{ t('adminServerLogs.range', { start: rangeStart, end: rangeEnd, total }) }}</span>
        <div class="flex items-center gap-2">
          <button class="lp-icon-button" type="button" :disabled="loading || page <= 1" :title="t('common.previous')" @click="goToPage(page - 1)">
            <ChevronLeft class="size-4" />
          </button>
          <span class="font-semibold">{{ page }} / {{ totalPages }}</span>
          <button class="lp-icon-button" type="button" :disabled="loading || page >= totalPages" :title="t('common.next')" @click="goToPage(page + 1)">
            <ChevronRight class="size-4" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
