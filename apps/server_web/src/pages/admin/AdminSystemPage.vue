<script setup lang="ts">
import { Save } from '@lucide/vue'
import { onMounted, ref } from 'vue'
import { api } from '@/api/client'
import { t } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { InstanceConfig } from '@/types'

const session = useSessionStore()
const config = ref<InstanceConfig | null>(null)
const error = ref('')

onMounted(load)

function normalizeReservedLoginConfig(nextConfig: InstanceConfig): InstanceConfig {
  return {
    ...nextConfig,
    smsEnabled: false,
    googleEnabled: false,
    wechatEnabled: false
  }
}

async function load() {
  if (!session.token) return
  try {
    error.value = ''
    config.value = normalizeReservedLoginConfig(await api.adminConfig(session.token))
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  }
}

async function save() {
  if (!session.token || !config.value) return
  try {
    const nextConfig = normalizeReservedLoginConfig(config.value)
    config.value = normalizeReservedLoginConfig(await api.patchAdminConfig(session.token, nextConfig))
    await load()
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  }
}
</script>

<template>
  <div class="grid grid-cols-1 gap-4">
    <section class="lp-panel">
      <div class="lp-panel-head">
        <h2 class="m-0 text-base font-black">{{ t('adminSystem.title') }}</h2>
        <button class="lp-button-primary" :disabled="!config" @click="save">
          <Save class="size-4" />
          {{ t('common.save') }}
        </button>
      </div>
      <div class="lp-panel-body">
        <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
        <template v-if="config">
          <div class="lp-table-wrap">
            <table class="lp-table min-w-[720px]">
              <thead>
                <tr>
                  <th>{{ t('adminSystem.configItem') }}</th>
                  <th>{{ t('adminSystem.value') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="font-semibold text-slate-950">{{ t('adminSystem.publicBaseUrl') }}</td>
                  <td>
                    <input v-model.trim="config.publicBaseUrl" class="lp-input w-full max-w-xl" type="url" />
                  </td>
                </tr>
                <tr>
                  <td class="font-semibold text-slate-950">{{ t('adminSystem.registrationEnabled') }}</td>
                  <td><input v-model="config.registrationEnabled" type="checkbox" class="size-4 accent-teal-700" /></td>
                </tr>
                <tr>
                  <td class="font-semibold text-slate-950">{{ t('adminSystem.smsEnabled') }}</td>
                  <td>
                    <div class="flex flex-wrap items-center gap-2">
                      <input
                        :checked="false"
                        type="checkbox"
                        class="size-4 accent-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled
                      />
                      <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                        {{ t('adminSystem.reservedDisabled') }}
                      </span>
                    </div>
                    <p class="m-0 mt-1 text-xs font-medium text-slate-500">
                      {{ t('adminSystem.reservedLoginUnavailable') }}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td class="font-semibold text-slate-950">{{ t('adminSystem.googleEnabled') }}</td>
                  <td>
                    <div class="flex flex-wrap items-center gap-2">
                      <input
                        :checked="false"
                        type="checkbox"
                        class="size-4 accent-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled
                      />
                      <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                        {{ t('adminSystem.reservedDisabled') }}
                      </span>
                    </div>
                    <p class="m-0 mt-1 text-xs font-medium text-slate-500">
                      {{ t('adminSystem.reservedLoginUnavailable') }}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td class="font-semibold text-slate-950">{{ t('adminSystem.wechatEnabled') }}</td>
                  <td>
                    <div class="flex flex-wrap items-center gap-2">
                      <input
                        :checked="false"
                        type="checkbox"
                        class="size-4 accent-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled
                      />
                      <span class="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                        {{ t('adminSystem.reservedDisabled') }}
                      </span>
                    </div>
                    <p class="m-0 mt-1 text-xs font-medium text-slate-500">
                      {{ t('adminSystem.reservedLoginUnavailable') }}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td class="font-semibold text-slate-950">{{ t('adminSystem.maxDevices') }}</td>
                  <td>
                    <input v-model.number="config.maxDevicesPerAccount" class="lp-input max-w-xs" type="number" min="1" />
                  </td>
                </tr>
                <tr>
                  <td class="font-semibold text-slate-950">{{ t('adminSystem.maxStorageBytes') }}</td>
                  <td>
                    <input v-model.number="config.maxStorageBytes" class="lp-input max-w-xs" type="number" min="1" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
