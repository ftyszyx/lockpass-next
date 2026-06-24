<script setup lang="ts">
import { Search, Shield, UserX } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api/client'
import EmptyState from '@/components/EmptyState.vue'
import StatusPill from '@/components/StatusPill.vue'
import { t } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { AccountView } from '@/types'

const session = useSessionStore()
const accounts = ref<AccountView[]>([])
const query = ref('')
const error = ref('')
const busyAccountId = ref('')

const filteredAccounts = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return accounts.value
  return accounts.value.filter((account) =>
    `${account.displayName} ${account.email} ${account.roles.join(' ')} ${account.roles.map(roleLabel).join(' ')}`
      .toLowerCase()
      .includes(keyword)
  )
})

onMounted(load)

async function load() {
  if (!session.token) return
  try {
    error.value = ''
    accounts.value = await api.adminAccounts(session.token)
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  }
}

async function toggleAccount(account: AccountView) {
  if (!session.token) return
  busyAccountId.value = account.id
  error.value = ''
  try {
    await api.patchAdminAccount(session.token, account.id, { disabled: !account.disabledAt })
    await load()
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    busyAccountId.value = ''
  }
}

async function setAccountRole(account: AccountView, role: 'admin' | 'user') {
  if (!session.token) return
  busyAccountId.value = account.id
  error.value = ''
  try {
    await api.grantAdminRole(session.token, account.id, role)
    await load()
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    busyAccountId.value = ''
  }
}

function roleLabel(role: string) {
  const key = `roleCodes.${role}` as Parameters<typeof t>[0]
  const value = t(key)
  return value === key ? role : value
}

function isAdminAccount(account: AccountView) {
  return account.roles.includes('admin')
}

function isCurrentAccount(account: AccountView) {
  return account.id === session.account?.id
}
</script>

<template>
  <div class="grid gap-4">
    <section class="lp-panel">
      <div class="lp-panel-head">
        <h2 class="m-0 text-base font-black">{{ t('adminAccounts.title') }}</h2>
        <div class="flex w-96 items-center gap-2">
          <div class="relative min-w-0 flex-1">
            <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input v-model="query" class="lp-input pl-9" :placeholder="t('adminAccounts.searchPlaceholder')" />
          </div>
          <button class="lp-button" @click="load">{{ t('common.refresh') }}</button>
        </div>
      </div>
      <div class="lp-panel-body">
        <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
        <EmptyState v-if="filteredAccounts.length === 0" :title="t('adminAccounts.noAccounts')" />
        <div v-if="filteredAccounts.length" class="lp-table-wrap">
          <table class="lp-table min-w-[860px]">
            <thead>
              <tr>
                <th>{{ t('adminAccounts.account') }}</th>
                <th>{{ t('adminAccounts.roles') }}</th>
                <th>{{ t('adminAccounts.createdAt') }}</th>
                <th>{{ t('adminAccounts.status') }}</th>
                <th class="text-right">{{ t('adminAccounts.actions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="account in filteredAccounts" :key="account.id">
                <td>
                  <strong class="block">{{ account.displayName }}</strong>
                  <small class="text-slate-500">{{ account.email || account.id }}</small>
                </td>
                <td>
                  <span class="inline-flex flex-wrap items-center gap-1">
                    <Shield class="size-4 text-teal-700" />
                    <StatusPill v-for="role in account.roles" :key="role" tone="neutral">
                      {{ roleLabel(role) }}
                    </StatusPill>
                  </span>
                </td>
                <td class="text-slate-500">{{ account.createdAt }}</td>
                <td>
                  <StatusPill :tone="account.disabledAt ? 'danger' : 'ok'">
                    {{ account.disabledAt ? t('adminAccounts.disabled') : t('adminAccounts.normal') }}
                  </StatusPill>
                </td>
                <td class="text-right">
                  <div class="inline-flex flex-wrap justify-end gap-2">
                    <button
                      class="lp-button"
                      :disabled="busyAccountId === account.id || isCurrentAccount(account)"
                      :title="isCurrentAccount(account) ? t('adminAccounts.currentAccountActionDisabled') : undefined"
                      @click="setAccountRole(account, isAdminAccount(account) ? 'user' : 'admin')"
                    >
                      <Shield class="size-4" />
                      {{ isAdminAccount(account) ? t('adminAccounts.setUser') : t('adminAccounts.setAdmin') }}
                    </button>
                    <button
                      class="lp-button-danger"
                      :disabled="busyAccountId === account.id || isCurrentAccount(account)"
                      :title="isCurrentAccount(account) ? t('adminAccounts.currentAccountActionDisabled') : undefined"
                      @click="toggleAccount(account)"
                    >
                      <UserX class="size-4" />
                      {{ busyAccountId === account.id ? t('common.processing') : account.disabledAt ? t('adminAccounts.restore') : t('adminAccounts.disable') }}
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
