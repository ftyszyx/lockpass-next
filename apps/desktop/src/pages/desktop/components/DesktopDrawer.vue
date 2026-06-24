<script setup lang="ts">
import {
  Cloud,
  Copy,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  X
} from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SyncMode } from '@/services/syncClient'
import { openExternalUrl } from '@/services/vaultRepository'
import { useVaultStore } from '@/stores/vault'
import type { DrawerName, PasswordOptions } from '../types'

const props = defineProps<{
  activeDrawer: Exclude<DrawerName, null>
  generatedPassword: string
  passwordOptions: PasswordOptions
  canUsePassword: boolean
}>()

const emit = defineEmits<{
  close: []
  copyValue: [value: string]
  regenerate: []
  usePassword: []
  syncToast: [message: string]
  operationStart: [payload: { title: string; body: string }]
  operationEnd: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const syncMode = ref<SyncMode>(vaultStore.settings.sync.mode)
const syncServerUrl = ref(vaultStore.settings.sync.serverUrl)
const syncBusy = ref(false)
const syncErrorKey = ref('')
const syncConnected = computed(() => vaultStore.syncConnected)
const officialLoginInProgress = computed(() => vaultStore.officialLogin.inProgress)
const visibleSyncErrorKey = computed(() => {
  if (syncErrorKey.value) return syncErrorKey.value
  if (vaultStore.officialLogin.lastError) return syncErrorMessageKey(vaultStore.officialLogin.lastError)
  return ''
})
const syncState = computed<'offline' | 'needsSync' | 'conflicted' | 'synced'>(() => {
  if (!syncConnected.value) return 'offline'
  if (vaultStore.syncConflictCount > 0) return 'conflicted'
  if (!vaultStore.settings.sync.lastSyncAt || vaultStore.syncLocalChangeCount > 0) return 'needsSync'
  return 'synced'
})
const syncStatusTitle = computed(() => {
  if (syncState.value === 'offline') return t('sync.offlineTitle')
  if (syncState.value === 'conflicted') return t('sync.conflictedTitle')
  if (syncState.value === 'needsSync') return t('sync.needsSyncTitle')
  return t('sync.syncedTitle')
})
const syncStatusBody = computed(() => {
  if (syncState.value === 'offline') return t('sync.offlineBody')
  if (syncState.value === 'conflicted') return t('sync.conflictedBody', { count: vaultStore.syncConflictCount })
  if (!vaultStore.settings.sync.lastSyncAt) return t('sync.neverSyncedBody')
  if (vaultStore.syncLocalChangeCount > 0) return t('sync.localChangesBody', { count: vaultStore.syncLocalChangeCount })
  return t('sync.syncedBody', {
    account: vaultStore.settings.sync.accountLabel || vaultStore.syncHostLabel,
    time: new Date(vaultStore.settings.sync.lastSyncAt).toLocaleString(vaultStore.settings.locale)
  })
})
const syncStatusCardClass = computed(() => {
  if (syncState.value === 'offline') return 'border-rose-200 bg-rose-50 text-rose-950'
  if (syncState.value === 'conflicted') return 'border-rose-200 bg-rose-50 text-rose-950'
  if (syncState.value === 'needsSync') return 'border-amber-200 bg-amber-50 text-amber-950'
  return 'border-emerald-200 bg-emerald-50 text-emerald-950'
})
const isSelfHostedSync = computed(() => syncMode.value === 'selfhost')
const officialLoginButtonLabel = computed(() => {
  if (syncBusy.value || officialLoginInProgress.value) return t('sync.officialLoginPending')
  return t('sync.openServerLogin')
})

watch(
  () => props.activeDrawer,
  (drawer) => {
    if (drawer !== 'sync') return
    syncMode.value = vaultStore.settings.sync.mode
    syncServerUrl.value = vaultStore.settings.sync.serverUrl
    syncErrorKey.value = ''
  },
  { immediate: true }
)

watch(
  () => vaultStore.syncConnected,
  (connected) => {
    if (!connected) return
    vaultStore.clearOfficialLoginState()
    syncErrorKey.value = ''
  }
)

async function saveSyncSettings(): Promise<void> {
  syncBusy.value = true
  vaultStore.clearOfficialLoginState()
  syncErrorKey.value = ''
  try {
    await vaultStore.saveSyncSettings({
      mode: syncMode.value,
      serverUrl: syncServerUrl.value
    })
    emit('syncToast', t('sync.settingsSaved'))
  } catch (error) {
    syncErrorKey.value = syncErrorMessageKey(error)
  } finally {
    syncBusy.value = false
  }
}

async function openSyncLogin(): Promise<void> {
  syncBusy.value = true
  vaultStore.setOfficialLoginInProgress(true)
  syncErrorKey.value = ''
  try {
    await vaultStore.saveSyncSettings({
      mode: syncMode.value,
      serverUrl: syncServerUrl.value
    })
    const authorization = await vaultStore.startOfficialSyncAuthorization()
    syncServerUrl.value = vaultStore.settings.sync.serverUrl
    await openExternalUrl(authorization.loginUrl)
    emit('syncToast', t('sync.officialLoginPendingBody'))
  } catch (error) {
    vaultStore.clearOfficialLoginState()
    syncErrorKey.value = syncErrorMessageKey(error)
  } finally {
    syncBusy.value = false
  }
}

async function runSyncNow(): Promise<void> {
  syncBusy.value = true
  vaultStore.clearOfficialLoginState()
  syncErrorKey.value = ''
  emit('operationStart', { title: t('progress.syncTitle'), body: t('progress.syncBody') })
  const startedAt = performance.now()
  try {
    const result = await vaultStore.runSync()
    const message = result.rejectedCodes.length > 0
      ? t('sync.syncRejectedDetails', { details: result.rejectedCodes.join('; ') })
      : t('sync.syncSuccess', {
          pushed: result.pushed,
          pulled: result.pulled,
          conflicts: result.conflicts,
          rejected: result.rejected
        })
    emit('syncToast', message)
  } catch (error) {
    syncErrorKey.value = syncErrorMessageKey(error)
  } finally {
    const elapsed = performance.now() - startedAt
    if (elapsed < 450) {
      await new Promise((resolve) => window.setTimeout(resolve, 450 - elapsed))
    }
    emit('operationEnd')
    syncBusy.value = false
  }
}

async function disconnectSync(): Promise<void> {
  syncBusy.value = true
  syncErrorKey.value = ''
  try {
    await vaultStore.disconnectSync()
    emit('syncToast', t('sync.disconnectSuccess'))
  } catch (error) {
    syncErrorKey.value = syncErrorMessageKey(error)
  } finally {
    syncBusy.value = false
  }
}

function syncErrorMessageKey(error: unknown): string {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  if (
    message === 'syncLocked' ||
    message === 'syncOfficialUnavailable' ||
    message === 'syncServerRequired' ||
    message === 'syncNotConnected' ||
    message === 'syncConnectionInvalid' ||
    message === 'syncUnsupportedId' ||
    message === 'syncOfficialAuthorizationMissing' ||
    message === 'syncOfficialCallbackMismatch' ||
    message === 'syncOfficialDenied' ||
    message === 'syncOfficialExpired' ||
    message === 'syncNetworkBlocked' ||
    message === 'popup_blocked'
  ) {
    return `sync.${message}`
  }
  return 'sync.syncFailed'
}
</script>

<template>
  <div class="fixed inset-0 z-[70]">
    <button class="absolute inset-0 bg-slate-950/40" aria-label="Close" @click="emit('close')"></button>
    <aside class="absolute right-0 top-0 flex h-[100dvh] w-[420px] max-w-[94vw] flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl">
      <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
        <h3 class="font-bold">
          {{
            activeDrawer === 'generator'
              ? t('drawer.passwordGenerator')
              : t('sync.title')
          }}
        </h3>
        <button class="icon-button" @click="emit('close')"><X class="size-4" /></button>
      </div>

      <div v-if="activeDrawer === 'generator'" class="grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3">
          <code class="break-words font-mono">{{ generatedPassword }}</code>
          <button class="icon-button" @click="emit('copyValue', generatedPassword)"><Copy class="size-4" /></button>
        </div>
        <label class="grid gap-2 text-sm font-bold text-slate-500">
          {{ t('drawer.length') }}
          <div class="grid grid-cols-[1fr_42px] items-center gap-2">
            <input v-model.number="passwordOptions.length" type="range" min="8" max="32" @input="emit('regenerate')" />
            <strong class="text-slate-950">{{ passwordOptions.length }}</strong>
          </div>
        </label>
        <div class="grid grid-cols-2 gap-2">
          <label class="check"><input v-model="passwordOptions.uppercase" type="checkbox" @change="emit('regenerate')" />{{ t('drawer.uppercase') }}</label>
          <label class="check"><input v-model="passwordOptions.numbers" type="checkbox" @change="emit('regenerate')" />{{ t('drawer.numbers') }}</label>
          <label class="check"><input v-model="passwordOptions.symbols" type="checkbox" @change="emit('regenerate')" />{{ t('drawer.symbols') }}</label>
          <label class="check"><input v-model="passwordOptions.avoidAmbiguous" type="checkbox" @change="emit('regenerate')" />{{ t('drawer.readable') }}</label>
        </div>
        <button class="primary-button" @click="emit('regenerate')">
          <RefreshCw class="size-4" />
          {{ t('drawer.regenerate') }}
        </button>
        <button v-if="canUsePassword" class="plain-button" @click="emit('usePassword')">
          <Save class="size-4" />
          {{ t('drawer.usePassword') }}
        </button>
      </div>

      <div v-else-if="activeDrawer === 'sync'" class="grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <div class="grid gap-1 rounded-lg border px-3 py-2 text-left" :class="syncStatusCardClass">
          <div class="flex items-center gap-2 font-bold">
            <Cloud class="size-4" />
            {{ syncStatusTitle }}
          </div>
          <p class="text-xs leading-5 text-slate-500">{{ syncStatusBody }}</p>
        </div>

        <label class="form-label">
          {{ t('sync.mode') }}
          <select v-model="syncMode" class="form-input" :disabled="syncBusy">
            <option value="official">{{ t('sync.officialHosted') }}</option>
            <option value="selfhost">{{ t('sync.selfHosted') }}</option>
          </select>
        </label>

        <div v-if="isSelfHostedSync && !syncConnected" class="grid gap-3">
          <label class="form-label">
            {{ t('sync.serverUrl') }}
            <input v-model="syncServerUrl" class="form-input" :disabled="syncBusy" :placeholder="t('sync.serverUrlPlaceholder')" />
          </label>
        </div>

        <div v-if="!syncConnected" class="grid gap-2">
          <button class="primary-button justify-center" :disabled="syncBusy" @click="openSyncLogin">
            <LogIn class="size-4" />
            {{ officialLoginButtonLabel }}
          </button>
          <button class="plain-button justify-center" :disabled="syncBusy" @click="saveSyncSettings">
            <Save class="size-4" />
            {{ t('sync.saveSettings') }}
          </button>
        </div>

        <div v-if="syncConnected" class="grid grid-cols-2 gap-2">
          <button class="plain-button justify-center" :disabled="syncBusy" @click="runSyncNow">
            <RefreshCw class="size-4" />
            {{ t('sync.syncNow') }}
          </button>
          <button class="plain-button justify-center" :disabled="syncBusy" @click="disconnectSync">
            <LogOut class="size-4" />
            {{ t('sync.disconnect') }}
          </button>
        </div>
        <p v-if="visibleSyncErrorKey" class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{{ t(visibleSyncErrorKey) }}</p>
      </div>
    </aside>
  </div>
</template>
