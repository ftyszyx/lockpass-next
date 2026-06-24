<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { api } from '@/api/client'
import EmptyState from '@/components/EmptyState.vue'
import StatusPill from '@/components/StatusPill.vue'
import { t, useI18n } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { AuditLogView } from '@/types'

const session = useSessionStore()
const auditLogs = ref<AuditLogView[]>([])
const loading = ref(false)
const error = ref('')
const { locale } = useI18n()

onMounted(load)

async function load() {
  if (!session.token) return
  loading.value = true
  error.value = ''
  try {
    auditLogs.value = await api.auditLogs(session.token)
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    loading.value = false
  }
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.value)
}

function formatMetadata(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
</script>

<template>
  <section class="lp-panel">
    <div class="lp-panel-head">
      <h2 class="m-0 text-base font-black">{{ t('adminAudit.title') }}</h2>
      <div class="flex items-center gap-2">
        <StatusPill>{{ auditLogs.length }}</StatusPill>
        <button class="lp-button" :disabled="loading" @click="load">
          <RefreshCw class="size-4" />
          {{ t('common.refresh') }}
        </button>
      </div>
    </div>
    <div class="lp-panel-body">
      <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
      <EmptyState v-if="auditLogs.length === 0" :title="t('adminAudit.noLogs')" />
      <div v-if="auditLogs.length" class="lp-table-wrap">
        <table class="lp-table min-w-[1100px]">
          <thead>
            <tr>
              <th>{{ t('common.id') }}</th>
              <th>{{ t('adminAudit.action') }}</th>
              <th>{{ t('adminAudit.targetType') }}</th>
              <th>{{ t('adminAudit.targetId') }}</th>
              <th>{{ t('adminAudit.actor') }}</th>
              <th>{{ t('adminAudit.time') }}</th>
              <th>{{ t('common.metadata') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in auditLogs" :key="log.id">
              <td class="font-mono text-xs">{{ log.id }}</td>
              <td class="font-semibold text-slate-950">{{ log.action }}</td>
              <td>{{ log.targetType }}</td>
              <td class="font-mono text-xs text-slate-500">{{ log.targetId || '-' }}</td>
              <td class="font-mono text-xs text-slate-500">{{ log.actorAccountId || '-' }}</td>
              <td class="text-slate-500">{{ formatDate(log.createdAt) }}</td>
              <td class="max-w-[360px]">
                <code
                  v-if="formatMetadata(log.metadata)"
                  class="block rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600 break-all"
                >
                  {{ formatMetadata(log.metadata) }}
                </code>
                <span v-else>-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
