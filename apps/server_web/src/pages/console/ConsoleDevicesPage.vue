<script setup lang="ts">
import { Check, Pencil, RefreshCw, Trash2, X } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { api } from '@/api/client'
import EmptyState from '@/components/EmptyState.vue'
import StatusPill from '@/components/StatusPill.vue'
import { t, useI18n } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { DeviceView } from '@/types'

const session = useSessionStore()
const devices = ref<DeviceView[]>([])
const loading = ref(false)
const error = ref('')
const editingDeviceId = ref('')
const editingDeviceRemark = ref('')
const savingDeviceId = ref('')
const revokingDeviceId = ref('')
const { locale } = useI18n()

onMounted(load)

async function load() {
  if (!session.token) return
  loading.value = true
  error.value = ''
  try {
    devices.value = await api.devices(session.token)
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    loading.value = false
  }
}

async function revokeDevice(id: string) {
  if (!session.token) return
  const device = devices.value.find((entry) => entry.id === id)
  if (!window.confirm(t('consoleDevices.revokeConfirm', { name: device?.remark || device?.name || id }))) return
  revokingDeviceId.value = id
  error.value = ''
  try {
    await api.revokeDevice(session.token, id)
    await load()
  } catch (cause) {
    error.value = userFacingErrorMessage(cause) || t('consoleDevices.revokeFailed')
  } finally {
    revokingDeviceId.value = ''
  }
}

function startEditRemark(device: DeviceView) {
  editingDeviceId.value = device.id
  editingDeviceRemark.value = device.remark ?? ''
}

function cancelEditRemark() {
  editingDeviceId.value = ''
  editingDeviceRemark.value = ''
}

async function saveRemark(device: DeviceView) {
  if (!session.token) return
  const nextRemark = editingDeviceRemark.value.trim()
  if (nextRemark === (device.remark ?? '')) {
    cancelEditRemark()
    return
  }
  savingDeviceId.value = device.id
  try {
    await api.updateDeviceRemark(session.token, device.id, nextRemark)
    cancelEditRemark()
    await load()
  } catch (cause) {
    error.value = userFacingErrorMessage(cause) || t('consoleDevices.remarkFailed')
  } finally {
    savingDeviceId.value = ''
  }
}

function formatDate(value?: string | null) {
  if (!value) return t('common.neverSynced')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale.value)
}
</script>

<template>
  <section class="lp-panel">
    <div class="lp-panel-head">
      <div>
        <h2 class="m-0 text-base font-black">{{ t('consoleDevices.title') }}</h2>
        <p class="m-0 mt-1 text-sm text-slate-500">{{ t('consoleDevices.summary') }}</p>
      </div>
      <button class="lp-button" type="button" :disabled="loading" @click="load">
        <RefreshCw class="size-4" />
        {{ t('common.refresh') }}
      </button>
    </div>

    <div class="lp-panel-body">
      <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
      <EmptyState v-if="loading && devices.length === 0" :title="t('common.processing')" />
      <EmptyState v-else-if="devices.length === 0" :title="t('consoleDevices.emptyTitle')" :body="t('consoleDevices.emptyBody')" />

      <div v-if="devices.length" class="lp-table-wrap">
        <table class="lp-table min-w-[920px]">
          <thead>
            <tr>
              <th>{{ t('common.deviceRemark') }}</th>
              <th>{{ t('common.deviceName') }}</th>
              <th>{{ t('common.clientDeviceId') }}</th>
              <th>{{ t('common.lastSeenAt') }}</th>
              <th>{{ t('common.lastSeenIp') }}</th>
              <th>{{ t('common.createdAt') }}</th>
              <th>{{ t('adminAccounts.status') }}</th>
              <th class="text-right">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="device in devices" :key="device.id">
              <td>
                <div v-if="editingDeviceId === device.id" class="flex min-w-56 items-center gap-2">
                  <input
                    v-model="editingDeviceRemark"
                    class="lp-input h-9"
                    :aria-label="t('common.deviceRemark')"
                    :placeholder="t('common.deviceRemark')"
                    :disabled="savingDeviceId === device.id"
                    @keyup.enter="saveRemark(device)"
                    @keyup.esc="cancelEditRemark"
                  />
                </div>
                <strong v-else class="block text-slate-950">{{ device.remark || '-' }}</strong>
              </td>
              <td class="font-semibold text-slate-950">{{ device.name }}</td>
              <td class="font-mono text-xs text-slate-500">{{ device.clientDeviceId || '-' }}</td>
              <td class="text-slate-500">{{ formatDate(device.lastSeenAt) }}</td>
              <td class="font-mono text-xs text-slate-500">{{ device.lastSeenIp || '-' }}</td>
              <td class="text-slate-500">{{ formatDate(device.createdAt) }}</td>
              <td>
                <StatusPill :tone="device.revokedAt ? 'danger' : 'ok'">
                  {{ device.revokedAt ? t('consoleDevices.revoked') : t('consoleDevices.syncable') }}
                </StatusPill>
              </td>
              <td class="text-right">
                <div class="inline-flex items-center gap-2">
                  <template v-if="editingDeviceId === device.id">
                    <button
                      class="lp-icon-button"
                      type="button"
                      :title="t('consoleDevices.saveRemark')"
                      :aria-label="t('consoleDevices.saveRemark')"
                      :disabled="savingDeviceId === device.id"
                      @click="saveRemark(device)"
                    >
                      <Check class="size-4" />
                    </button>
                    <button
                      class="lp-icon-button"
                      type="button"
                      :title="t('consoleDevices.cancel')"
                      :aria-label="t('consoleDevices.cancel')"
                      :disabled="savingDeviceId === device.id"
                      @click="cancelEditRemark"
                    >
                      <X class="size-4" />
                    </button>
                  </template>
                  <template v-else>
                    <button
                      class="lp-icon-button"
                      type="button"
                      :title="t('consoleDevices.editRemark')"
                      :aria-label="t('consoleDevices.editRemark')"
                      :disabled="Boolean(device.revokedAt) || revokingDeviceId === device.id"
                      @click="startEditRemark(device)"
                    >
                      <Pencil class="size-4" />
                    </button>
                    <button class="lp-button-danger" type="button" :disabled="Boolean(device.revokedAt) || revokingDeviceId === device.id" @click="revokeDevice(device.id)">
                      <Trash2 class="size-4" />
                      {{ revokingDeviceId === device.id ? t('common.processing') : t('consoleDevices.revoke') }}
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
