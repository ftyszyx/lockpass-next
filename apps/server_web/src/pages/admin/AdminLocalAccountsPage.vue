<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api/client'
import EmptyState from '@/components/EmptyState.vue'
import { t, useI18n } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { AdminSyncDataResponse } from '@/types'

const route = useRoute()
const session = useSessionStore()
const { locale } = useI18n()
const data = ref<AdminSyncDataResponse | null>(null)
const loading = ref(false)
const error = ref('')

const isAdminScope = computed(() => route.path.startsWith('/admin'))
const localAccounts = computed(() => data.value?.syncSpaces ?? [])

onMounted(load)

watch(() => route.path, load)

async function load() {
  if (!session.token) return
  loading.value = true
  error.value = ''
  try {
    data.value = isAdminScope.value
      ? await api.adminSyncData(session.token)
      : await api.syncData(session.token)
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    loading.value = false
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.value)
}

function shortId(value?: string | null) {
  if (!value) return '-'
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value
}
</script>

<template>
  <section class="lp-panel">
    <div class="lp-panel-head">
      <div class="min-w-0 py-3">
        <h2 class="m-0 text-base font-black">{{ t('adminLocalAccounts.title') }}</h2>
        <p class="m-0 mt-1 text-sm text-slate-500">{{ t('adminLocalAccounts.summary') }}</p>
        <p class="m-0 mt-1 text-xs font-semibold text-slate-500">
          {{ isAdminScope ? t('adminSyncData.scopeAdmin') : t('adminSyncData.scopeUser') }}
        </p>
      </div>
      <button class="lp-button shrink-0" :disabled="loading" @click="load">
        <RefreshCw class="size-4" />
        {{ t('common.refresh') }}
      </button>
    </div>

    <div class="lp-panel-body">
      <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>

      <EmptyState v-if="!data" :title="loading ? t('common.processing') : t('adminSyncData.noData')" />
      <EmptyState v-else-if="localAccounts.length === 0" :title="t('adminSyncData.noData')" />

      <div v-else class="lp-table-wrap">
        <table class="lp-table min-w-[860px]">
          <thead>
            <tr>
              <th>{{ t('adminSyncData.syncSpaceName') }}</th>
              <th>{{ t('adminSyncData.account') }}</th>
              <th>{{ t('adminSyncData.spaceId') }}</th>
              <th>{{ t('adminSyncData.objectCount') }}</th>
              <th>{{ t('adminSyncData.activeKeyCount') }}</th>
              <th>{{ t('adminSyncData.updatedAt') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="account in localAccounts" :key="account.id">
              <td class="font-semibold text-slate-950">{{ account.displayName }}</td>
              <td>
                <strong class="block">{{ account.accountName }}</strong>
                <small class="font-mono text-slate-500">{{ shortId(account.accountId) }}</small>
              </td>
              <td class="font-mono text-xs">{{ shortId(account.id) }}</td>
              <td>{{ account.objectCount }}</td>
              <td>{{ account.activeWrappedVaultKeyCount }}</td>
              <td class="text-slate-500">{{ formatDate(account.updatedAt) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
