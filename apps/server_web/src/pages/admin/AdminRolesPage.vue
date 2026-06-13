<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api/client'
import EmptyState from '@/components/EmptyState.vue'
import StatusPill from '@/components/StatusPill.vue'
import { t } from '@/i18n'
import { userFacingErrorMessage } from '@/services/errorMessage'
import { useSessionStore } from '@/stores/session'
import type { AccountView, PermissionView, RoleView } from '@/types'

const session = useSessionStore()
const roles = ref<RoleView[]>([])
const permissions = ref<PermissionView[]>([])
const accounts = ref<AccountView[]>([])
const loading = ref(false)
const error = ref('')

const permissionMap = computed(() => new Map(permissions.value.map((permission) => [permission.code, permission])))

onMounted(load)

function roleLabel(role: RoleView | string) {
  const code = typeof role === 'string' ? role : role.code
  const key = `roleCodes.${code}` as Parameters<typeof t>[0]
  const value = t(key)
  return value === key ? (typeof role === 'string' ? role : role.name || role.code) : value
}

function roleDescription(code: string) {
  const key = `roleDescriptions.${code}` as Parameters<typeof t>[0]
  const value = t(key)
  return value === key ? '' : value
}

function assignedCount(roleCode: string) {
  return accounts.value.filter((account) => account.roles.includes(roleCode)).length
}

function rolePermissions(role: RoleView) {
  return role.permissions.map((code) => permissionMap.value.get(code) ?? { code, description: code })
}

function permissionSummary(role: RoleView) {
  return rolePermissions(role)
    .map((permission) => permission.code)
    .join(', ')
}

async function load() {
  if (!session.token) return
  loading.value = true
  error.value = ''
  try {
    const [roleResult, accountResult] = await Promise.all([
      api.adminRoles(session.token),
      api.adminAccounts(session.token)
    ])
    roles.value = roleResult.roles
    permissions.value = roleResult.permissions
    accounts.value = accountResult
  } catch (cause) {
    error.value = userFacingErrorMessage(cause)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="grid gap-4">
    <section class="lp-panel">
      <div class="lp-panel-head">
        <div class="min-w-0 py-3">
          <h2 class="m-0 text-base font-black">{{ t('adminRoles.title') }}</h2>
          <p class="m-0 mt-1 text-sm text-slate-500">{{ t('adminRoles.summary') }}</p>
        </div>
        <button class="lp-button shrink-0" :disabled="loading" @click="load">
          <RefreshCw class="size-4" />
          {{ t('common.refresh') }}
        </button>
      </div>

      <div class="lp-panel-body">
        <p v-if="error" class="m-0 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
        <EmptyState v-if="roles.length === 0" :title="t('adminRoles.noRoles')" />

        <div v-if="roles.length" class="lp-table-wrap">
          <table class="lp-table min-w-[1040px]">
            <thead>
              <tr>
                <th>{{ t('common.role') }}</th>
                <th>{{ t('common.code') }}</th>
                <th>{{ t('common.description') }}</th>
                <th>{{ t('common.type') }}</th>
                <th>{{ t('adminRoles.assignedAccounts') }}</th>
                <th>{{ t('common.permission') }}</th>
                <th>{{ t('adminRoles.grantedPermissions') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="role in roles" :key="role.code">
                <td>
                  <strong class="block text-slate-950">{{ roleLabel(role) }}</strong>
                </td>
                <td class="font-mono text-xs">{{ role.code }}</td>
                <td class="max-w-[280px] text-slate-500">{{ roleDescription(role.code) || '-' }}</td>
                <td>
                  <StatusPill :tone="role.builtIn ? 'ok' : 'neutral'">
                    {{ role.builtIn ? t('common.builtIn') : t('common.custom') }}
                  </StatusPill>
                </td>
                <td>{{ assignedCount(role.code) }}</td>
                <td>{{ role.permissions.length }}</td>
                <td class="max-w-[360px] text-slate-500">
                  {{ permissionSummary(role) || t('common.none') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </section>
  </div>
</template>
