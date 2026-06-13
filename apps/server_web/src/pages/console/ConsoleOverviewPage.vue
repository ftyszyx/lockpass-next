<script setup lang="ts">
import { RefreshCw, Save } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api/client'
import { t } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { AccountView, UsageResponse } from '@/types'

const session = useSessionStore()
const profile = ref<AccountView | null>(null)
const usage = ref<UsageResponse | null>(null)
const displayName = ref('')
const loading = ref(false)
const error = ref('')
const profileSaving = ref(false)
const profileSaveError = ref('')
const profileSaveSuccess = ref('')
const activeTable = ref<'usage' | 'profile'>('usage')

const tableTabs = computed(() => [
  { key: 'usage' as const, label: t('consoleOverview.usageSummary') },
  { key: 'profile' as const, label: t('consoleOverview.profileTitle') }
])
const activeTableLabel = computed(() => tableTabs.value.find((tab) => tab.key === activeTable.value)?.label ?? '')

onMounted(load)

async function load() {
  if (!session.token) return
  loading.value = true
  error.value = ''
  try {
    const [profileResult, usageResult] = await Promise.all([
      api.profile(session.token),
      api.usage(session.token)
    ])
    profile.value = profileResult
    usage.value = usageResult
    displayName.value = profileResult.displayName
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    loading.value = false
  }
}

async function saveProfile() {
  if (!session.token) return
  profileSaving.value = true
  profileSaveError.value = ''
  profileSaveSuccess.value = ''
  try {
    const nextProfile = await api.updateProfile(session.token, displayName.value)
    profile.value = nextProfile
    displayName.value = nextProfile.displayName
    session.account = nextProfile
    profileSaveSuccess.value = t('consoleOverview.profileSaved')
  } catch (cause) {
    profileSaveError.value = userFacingErrorMessage(cause) || t('consoleOverview.profileSaveFailed')
  } finally {
    profileSaving.value = false
  }
}

function formatBytes(value = 0) {
  if (value < 1024) return t('common.bytes', { value })
  if (value < 1024 * 1024) return t('common.kilobytes', { value: (value / 1024).toFixed(1) })
  return t('common.megabytes', { value: (value / 1024 / 1024).toFixed(1) })
}

function usageRows() {
  return [
    {
      label: t('consoleOverview.metrics.devices'),
      value: usage.value?.devices ?? '-',
      hint: t('consoleOverview.metrics.devicesHint')
    },
    {
      label: t('consoleOverview.metrics.syncObjects'),
      value: usage.value?.syncObjects ?? '-',
      hint: t('consoleOverview.metrics.syncObjectsHint')
    },
    {
      label: t('consoleOverview.metrics.syncEvents'),
      value: usage.value?.syncEvents ?? '-',
      hint: t('consoleOverview.metrics.syncEventsHint')
    },
    {
      label: t('consoleOverview.metrics.storage'),
      value: formatBytes(usage.value?.storageBytes),
      hint: t('consoleOverview.metrics.storageHint')
    }
  ]
}

function roleLabel(role: string) {
  const key = `roleCodes.${role}` as Parameters<typeof t>[0]
  const value = t(key)
  return value === key ? role : value
}
</script>

<template>
  <section class="lp-panel">
    <div class="lp-panel-head">
      <h2 class="m-0 text-base font-black">{{ activeTableLabel }}</h2>
      <button class="lp-button" type="button" :disabled="loading" @click="load">
        <RefreshCw class="size-4" />
        {{ t('common.refresh') }}
      </button>
    </div>

    <div class="lp-panel-body">
      <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>

      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="tab in tableTabs"
          :key="tab.key"
          class="h-9 rounded-lg px-3 text-sm font-bold"
          :class="activeTable === tab.key ? 'bg-teal-50 text-teal-700' : 'text-slate-500 hover:bg-slate-50'"
          @click="activeTable = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <div v-if="activeTable === 'usage'" class="lp-table-wrap">
        <table class="lp-table min-w-[720px]">
          <thead>
            <tr>
              <th>{{ t('consoleOverview.usageMetric') }}</th>
              <th>{{ t('consoleOverview.usageValue') }}</th>
              <th>{{ t('consoleOverview.usageHint') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in usageRows()" :key="row.label">
              <td class="font-semibold text-slate-950">{{ row.label }}</td>
              <td>{{ row.value }}</td>
              <td class="text-slate-500">{{ row.hint }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="activeTable === 'profile'" class="lp-table-wrap">
        <table class="lp-table min-w-[720px]">
          <thead>
            <tr>
              <th>{{ t('consoleOverview.profileField') }}</th>
              <th>{{ t('consoleOverview.profileValue') }}</th>
              <th class="text-right">{{ t('consoleOverview.profileEdit') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-semibold text-slate-950">{{ t('consoleOverview.displayName') }}</td>
              <td>
                <input v-model="displayName" class="lp-input max-w-md" :aria-label="t('consoleOverview.displayName')" :disabled="profileSaving" />
                <p v-if="profileSaveError" class="m-0 mt-2 text-sm font-semibold text-rose-700">{{ profileSaveError }}</p>
                <p v-else-if="profileSaveSuccess" class="m-0 mt-2 text-sm font-semibold text-teal-700">{{ profileSaveSuccess }}</p>
              </td>
              <td class="text-right">
                <button class="lp-button-primary" :disabled="profileSaving" @click="saveProfile">
                  <Save class="size-4" />
                  {{ profileSaving ? t('common.processing') : t('common.save') }}
                </button>
              </td>
            </tr>
            <tr>
              <td class="font-semibold text-slate-950">{{ t('consoleOverview.email') }}</td>
              <td class="text-slate-500">{{ profile?.email || '-' }}</td>
              <td class="text-right text-slate-400">-</td>
            </tr>
            <tr>
              <td class="font-semibold text-slate-950">{{ t('consoleOverview.roles') }}</td>
              <td class="text-slate-500">{{ profile?.roles.map(roleLabel).join(', ') || t('roleCodes.user') }}</td>
              <td class="text-right text-slate-400">-</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </section>
</template>
