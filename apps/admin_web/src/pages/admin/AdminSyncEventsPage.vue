<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/api/client'
import EmptyState from '@/components/EmptyState.vue'
import StatusPill from '@/components/StatusPill.vue'
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
const summaries = computed(() => data.value?.syncEventSummaries ?? [])

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

function formatBytes(value = 0) {
  if (value < 1024) return t('common.bytes', { value })
  if (value < 1024 * 1024) return t('common.kilobytes', { value: (value / 1024).toFixed(1) })
  return t('common.megabytes', { value: (value / 1024 / 1024).toFixed(1) })
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
        <h2 class="m-0 text-base font-black">{{ t('adminSyncEvents.title') }}</h2>
        <p class="m-0 mt-1 text-sm text-slate-500">{{ t('adminSyncEvents.summary') }}</p>
        <p class="m-0 mt-1 text-xs font-semibold text-slate-500">
          {{ isAdminScope ? t('adminSyncEvents.scopeAdmin') : t('adminSyncEvents.scopeUser') }}
        </p>
      </div>
      <button class="lp-button shrink-0" type="button" :disabled="loading" @click="load">
        <RefreshCw class="size-4" />
        {{ t('common.refresh') }}
      </button>
    </div>

    <div class="lp-panel-body">
      <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>

      <div class="flex flex-wrap justify-end gap-2">
        <StatusPill>{{ t('adminSyncData.syncEvents') }} ({{ data?.counts.syncEvents ?? 0 }})</StatusPill>
        <StatusPill>{{ t('adminSyncData.latestEventGroups') }}</StatusPill>
      </div>

      <EmptyState v-if="!data" :title="loading ? t('common.processing') : t('adminSyncData.noData')" />
      <EmptyState v-else-if="summaries.length === 0" :title="t('adminSyncData.noData')" />
      <div v-else class="lp-table-wrap">
        <table class="lp-table min-w-[1040px]">
          <thead>
            <tr>
              <th>{{ t('adminSyncData.syncedAt') }}</th>
              <th>{{ t('adminSyncData.account') }}</th>
              <th>{{ t('adminSyncData.syncSpaceName') }}</th>
              <th>{{ t('adminSyncData.eventCount') }}</th>
              <th>{{ t('adminSyncData.createdCount') }}</th>
              <th>{{ t('adminSyncData.updatedCount') }}</th>
              <th>{{ t('adminSyncData.deletedCount') }}</th>
              <th>{{ t('adminSyncData.eventRange') }}</th>
              <th>{{ t('adminSyncData.snapshotBytes') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="summary in summaries" :key="`${summary.syncedAt}-${summary.accountId}-${summary.syncSpaceId}-${summary.lastEventId}`">
              <td class="text-slate-500">{{ formatDate(summary.syncedAt) }}</td>
              <td>{{ summary.accountName }}</td>
              <td>
                <strong class="block">{{ summary.syncSpaceName }}</strong>
                <small class="font-mono text-slate-500">{{ shortId(summary.syncSpaceId) }}</small>
              </td>
              <td class="font-black text-slate-950">{{ summary.eventCount }}</td>
              <td>{{ summary.createdCount }}</td>
              <td>{{ summary.updatedCount }}</td>
              <td>{{ summary.deletedCount }}</td>
              <td class="font-mono text-xs">{{ summary.firstEventId }} - {{ summary.lastEventId }}</td>
              <td>{{ formatBytes(summary.snapshotBytes) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
