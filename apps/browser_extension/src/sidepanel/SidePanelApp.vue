<script setup lang="ts">
import type { VaultItem } from '@lockpass/core'
import { KeyRound } from '@lucide/vue'
import { getAccountInitials } from '@lockpass/ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AccountGate from './components/AccountGate.vue'
import ExtensionVaultSidebar from './components/ExtensionVaultSidebar.vue'
import PanelHeader from './components/PanelHeader.vue'
import VaultItemDetail from './components/VaultItemDetail.vue'
import VaultItemEditor from './components/VaultItemEditor.vue'
import VaultItemList from './components/VaultItemList.vue'
import { setExtensionLocale } from '@/i18n'
import {
  ExtensionRuntimeUnavailableError,
  keepExtensionRuntimeAlive,
  loadExtensionPanelState,
  lockPanel,
  onExtensionStateChanged,
  openAccountWebPage,
  requestSiteAccess,
  savePanelItem,
  setPanelLocale,
  setExtensionServer,
  setPanelSelection,
  unlockPanel
} from '@/services/extensionClient'
import { applyExtensionTheme } from '@/services/theme'
import { defaultExtensionServerSettings } from '@/services/extensionServer'
import type {
  ExtensionItemSaveInput,
  ExtensionLocale,
  ExtensionPanelState,
  ExtensionServerSettings
} from '@/shared/models'

const { locale, t } = useI18n()
const state = ref<ExtensionPanelState | null>(null)
const loading = ref(true)
const error = ref('')
const query = ref('')
const editorMode = ref<'create' | 'edit' | null>(null)
const itemActionBusy = ref(false)
const itemActionError = ref('')
const permissionBusy = ref(false)
const accountActionBusy = ref(false)
const localeActionBusy = ref(false)
let stopStateListener: () => void = () => undefined
let stopRuntimeKeepAlive: () => void = () => undefined

const activeItems = computed(() => {
  if (!state.value) return []
  return state.value.items.filter((item) => !item.archived && !item.sync.deletedAt)
})

const filteredItems = computed(() => {
  if (!state.value) return []
  const normalizedQuery = query.value.trim().toLocaleLowerCase(state.value.locale)
  return activeItems.value.filter((item) => {
    if (state.value?.selectedVaultId !== 'all' && item.vaultId !== state.value?.selectedVaultId) return false
    if (!normalizedQuery) return true
    return [item.title, item.subtitle, ...item.urls, ...item.tags]
      .join(' ')
      .toLocaleLowerCase(state.value!.locale)
      .includes(normalizedQuery)
  })
})

const selectedItem = computed<VaultItem | null>(() => {
  if (!state.value?.selectedItemId) return null
  return state.value.items.find((item) => item.id === state.value?.selectedItemId) ?? null
})

const editorVaultId = computed(() => {
  if (!state.value) return ''
  if (state.value.selectedVaultId !== 'all') return state.value.selectedVaultId
  return state.value.vaults[0]?.id ?? ''
})

const connectionLabel = computed(() => {
  if (state.value?.connectionStatus === 'online') return t('app.online')
  if (state.value?.connectionStatus === 'serverUnavailable') return t('app.serverUnavailable')
  return t('app.offline')
})
const loginServerSettings = computed(() => (
  state.value?.serverSettings ?? defaultExtensionServerSettings()
))
const selectedLocale = computed<ExtensionLocale>(() => (
  state.value?.locale ?? locale.value as ExtensionLocale
))

onMounted(() => {
  stopRuntimeKeepAlive = keepExtensionRuntimeAlive()
  void refreshState()
  stopStateListener = onExtensionStateChanged(() => void refreshState(false))
})

onBeforeUnmount(() => {
  stopStateListener()
  stopRuntimeKeepAlive()
})

async function refreshState(showLoading = true): Promise<void> {
  if (showLoading) loading.value = true
  error.value = ''
  try {
    applyPanelState(await loadExtensionPanelState())
  } catch (cause) {
    error.value = cause instanceof ExtensionRuntimeUnavailableError
      ? t('error.runtimeUnavailable')
      : cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (showLoading) loading.value = false
  }
}

async function selectVault(vaultId: 'all' | string): Promise<void> {
  if (!state.value) return
  state.value.selectedVaultId = vaultId
  state.value.selectedItemId = null
  editorMode.value = null
  itemActionError.value = ''
  await setPanelSelection({ vaultId, itemId: null })
}

async function selectItem(itemId: string): Promise<void> {
  if (!state.value) return
  state.value.selectedItemId = itemId
  editorMode.value = null
  itemActionError.value = ''
  await setPanelSelection({ itemId })
}

function createItem(): void {
  if (!state.value?.vaults.length) return
  editorMode.value = 'create'
  itemActionError.value = ''
}

function editItem(): void {
  if (!selectedItem.value) return
  editorMode.value = 'edit'
  itemActionError.value = ''
}

function closeItemEditor(): void {
  if (itemActionBusy.value) return
  editorMode.value = null
  itemActionError.value = ''
}

async function saveItem(input: ExtensionItemSaveInput): Promise<void> {
  if (itemActionBusy.value) return
  itemActionBusy.value = true
  itemActionError.value = ''
  try {
    applyPanelState(await savePanelItem(input))
    editorMode.value = null
  } catch (cause) {
    itemActionError.value = itemSaveErrorMessage(cause)
  } finally {
    itemActionBusy.value = false
  }
}

async function lockVault(): Promise<void> {
  if (accountActionBusy.value) return
  accountActionBusy.value = true
  error.value = ''
  try {
    applyPanelState(await lockPanel())
  } catch {
    error.value = t('error.actionFailed')
  } finally {
    accountActionBusy.value = false
  }
}

async function changeLocale(nextLocale: ExtensionLocale): Promise<void> {
  if (!state.value || localeActionBusy.value || nextLocale === state.value.locale) return
  const previousLocale = state.value.locale
  localeActionBusy.value = true
  error.value = ''
  setExtensionLocale(nextLocale)
  try {
    applyPanelState(await setPanelLocale(nextLocale))
  } catch {
    setExtensionLocale(previousLocale)
    error.value = t('error.actionFailed')
  } finally {
    localeActionBusy.value = false
  }
}

async function enableSiteAccess(): Promise<void> {
  if (!state.value || permissionBusy.value) return
  permissionBusy.value = true
  try {
    state.value.siteAccessEnabled = await requestSiteAccess()
    if (!state.value.siteAccessEnabled) error.value = t('error.permissionDenied')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : t('error.actionFailed')
  } finally {
    permissionBusy.value = false
  }
}

async function openAccountPage(page: 'login' | 'register'): Promise<void> {
  if (accountActionBusy.value) return
  accountActionBusy.value = true
  error.value = ''
  try {
    applyPanelState(await openAccountWebPage(page))
  } catch (cause) {
    if (cause instanceof Error && cause.message === 'authorization-cancelled') return
    error.value = cause instanceof Error && cause.message === 'official-web-url-missing'
      ? t('error.officialWebUrlMissing')
      : cause instanceof Error && cause.message === 'server-url-required'
        ? t('error.serverUrlRequired')
        : cause instanceof Error && cause.message === 'server-url-invalid'
          ? t('error.serverUrlInvalid')
      : cause instanceof Error && cause.message.startsWith('authorization-')
        ? t('error.authorizationFailed')
        : t('error.openWebFailed')
  } finally {
    accountActionBusy.value = false
  }
}

async function changeLoginServer(settings: ExtensionServerSettings): Promise<void> {
  if (accountActionBusy.value) return
  accountActionBusy.value = true
  error.value = ''
  try {
    applyPanelState(await setExtensionServer(settings))
  } catch (cause) {
    error.value = cause instanceof Error && cause.message === 'server-url-required'
      ? t('error.serverUrlRequired')
      : t('error.serverUrlInvalid')
  } finally {
    accountActionBusy.value = false
  }
}

async function unlockVault(input: { password: string; secretKey?: string }): Promise<void> {
  if (!state.value?.account || accountActionBusy.value) return
  accountActionBusy.value = true
  error.value = ''
  try {
    applyPanelState(await unlockPanel({
      serverUrl: state.value.account.serverUrl,
      password: input.password,
      secretKey: input.secretKey
    }))
  } catch (cause) {
    error.value = unlockErrorMessage(cause)
  } finally {
    accountActionBusy.value = false
  }
}

function unlockErrorMessage(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : ''
  if (code === 'secret-key-required') return t('error.secretKeyRequired')
  if (code === 'server-access-denied') return t('error.serverAccessDenied')
  if (code === 'server-unavailable') return t('error.serverUnavailable')
  if (code === 'device-authorization-expired' || code === 'device-authorization-missing') {
    return t('error.authorizationExpired')
  }
  if (code === 'server-vault-missing' || code === 'server-vault-key-missing') {
    return t('error.serverVaultMissing')
  }
  if (code === 'trusted-secret-storage-failed') return t('error.secretKeyStorageFailed')
  return t('error.unlockFailed')
}

function itemSaveErrorMessage(cause: unknown): string {
  const code = cause instanceof Error ? cause.message : ''
  if (code === 'item-title-required') return t('error.itemTitleRequired')
  if (code === 'item-conflict') return t('error.itemConflict')
  if (code === 'vault-session-expired') return t('error.vaultSessionExpired')
  if (code === 'device-authorization-expired' || code === 'device-authorization-missing') {
    return t('error.authorizationExpired')
  }
  if (code === 'server-unavailable') return t('error.serverUnavailable')
  if (code === 'attachment-create-unsupported') return t('error.attachmentCreateUnsupported')
  return t('error.itemSaveFailed')
}

function applyPanelState(nextState: ExtensionPanelState): void {
  state.value = nextState
  if (!nextState.account || !nextState.unlocked) {
    query.value = ''
    editorMode.value = null
    itemActionError.value = ''
  }
  setExtensionLocale(nextState.locale)
  applyExtensionTheme(nextState.theme)
}
</script>

<template>
  <div class="extension-shell">
    <PanelHeader
      :search-enabled="Boolean(state?.account && state.unlocked)"
      :create-enabled="Boolean(state?.vaults.length)"
      :locale="selectedLocale"
      :locale-enabled="Boolean(state)"
      :locale-busy="localeActionBusy"
      v-model:query="query"
      @create="createItem"
      @lock="lockVault"
      @locale-change="changeLocale"
    />

    <main v-if="loading" class="loading-view">{{ t('app.loading') }}</main>

    <main v-else-if="error && !state" class="error-view">
      <strong>{{ t('error.loadFailed') }}</strong>
      <small>{{ error }}</small>
      <button class="plain-button" type="button" @click="refreshState()">{{ t('app.retry') }}</button>
    </main>

    <AccountGate
      v-else-if="!state?.account || !state.unlocked"
      :signed-out="!state?.account"
      :requires-secret-key="state?.requiresSecretKey ?? false"
      :server-settings="loginServerSettings"
      :busy="accountActionBusy"
      :error="error"
      @login="openAccountPage('login')"
      @register="openAccountPage('register')"
      @server-change="changeLoginServer"
      @unlock="unlockVault"
    />

    <div v-else class="extension-workspace">
      <ExtensionVaultSidebar
        :account-name="state.account.displayName"
        :account-initials="getAccountInitials(state.account.displayName)"
        :status-label="connectionLabel"
        :status-tone="state.connectionStatus === 'online' ? 'normal' : 'warning'"
        :vaults="state.vaults"
        :items="activeItems"
        :selected-vault-id="state.selectedVaultId"
        :site-access-enabled="state.siteAccessEnabled"
        :site-access-busy="permissionBusy"
        @select-vault="selectVault"
        @enable-site-access="enableSiteAccess"
      />

      <VaultItemList
        :items="filteredItems"
        :selected-item-id="state.selectedItemId"
        @select-item="selectItem"
      />

      <VaultItemEditor
        v-if="editorMode"
        :key="`${editorMode}:${selectedItem?.id ?? 'new'}`"
        :item="editorMode === 'edit' ? selectedItem : null"
        :vaults="state.vaults"
        :default-vault-id="editorVaultId"
        :busy="itemActionBusy"
        :error="itemActionError"
        @cancel="closeItemEditor"
        @save="saveItem"
      />
      <VaultItemDetail
        v-else-if="selectedItem"
        :item="selectedItem"
        :show-back="false"
        @edit="editItem"
      />
      <section v-else class="extension-detail-empty">
        <KeyRound />
        <strong>{{ t('app.selectItem') }}</strong>
      </section>
    </div>

    <div v-if="error && state?.account && state.unlocked" class="inline-error">{{ error }}</div>
  </div>
</template>
