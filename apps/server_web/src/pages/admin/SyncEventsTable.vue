<script setup lang="ts">
import EmptyState from '@/components/EmptyState.vue'
import { t, useI18n } from '@/i18n'
import type { AdminSyncEventView } from '@/types'

defineProps<{
  events: AdminSyncEventView[]
}>()

const { locale } = useI18n()

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

function eventTypeLabel(value: string) {
  const key = `adminSyncData.eventTypes.${value}` as Parameters<typeof t>[0]
  const label = t(key)
  return label === key ? value : label
}
</script>

<template>
  <EmptyState v-if="events.length === 0" :title="t('adminSyncData.noData')" />
  <div v-else class="lp-table-wrap">
    <table class="lp-table min-w-[1000px]">
      <thead>
        <tr>
          <th>{{ t('adminSyncData.eventId') }}</th>
          <th>{{ t('adminSyncData.account') }}</th>
          <th>{{ t('adminSyncData.syncSpaceName') }}</th>
          <th>{{ t('adminSyncData.eventType') }}</th>
          <th>{{ t('adminSyncData.objectId') }}</th>
          <th>{{ t('adminSyncData.objectRevision') }}</th>
          <th>{{ t('adminSyncData.baseRevision') }}</th>
          <th>{{ t('adminSyncData.snapshotBytes') }}</th>
          <th>{{ t('adminSyncData.createdAt') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="event in events" :key="event.id">
          <td>{{ event.id }}</td>
          <td>{{ event.accountName }}</td>
          <td>
            <strong class="block">{{ event.syncSpaceName }}</strong>
            <small class="font-mono text-slate-500">{{ shortId(event.syncSpaceId) }}</small>
          </td>
          <td>
            <strong class="block">{{ eventTypeLabel(event.eventType) }}</strong>
            <small class="font-mono text-slate-500">{{ event.eventType }}</small>
          </td>
          <td class="font-mono text-xs">{{ shortId(event.objectId) }}</td>
          <td>{{ event.objectRevision }}</td>
          <td>{{ event.baseRevision }}</td>
          <td>{{ event.snapshotBytes }}</td>
          <td class="text-slate-500">{{ formatDate(event.createdAt) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
