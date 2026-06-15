<script setup lang="ts">
import {
  ArchiveRestore,
  ArrowLeft,
  Copy,
  DatabaseBackup,
  FileSpreadsheet,
  FolderOpen,
  Info,
  Keyboard,
  LockKeyhole,
  Logs,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  Settings,
  Shield,
  TriangleAlert,
  UserMinus,
  X
} from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { VaultAttachment, VaultItem } from '@lockpass/core'
import { localeLabels, supportedLocales, type SupportedLocale } from '@/i18n'
import { readDesktopLog } from '@/services/logger'
import {
  DEFAULT_SHORTCUT_SETTINGS,
  findShortcutConflict,
  formatShortcutFromEvent,
  GLOBAL_SHORTCUT_ACTIONS,
  INTERNAL_SHORTCUT_ACTIONS,
  isShortcutValid,
  normalizeShortcut,
  shortcutSettingsEqual
} from '@/services/shortcuts'
import { getAppDataDir, loadStartOnLogin, openAppDataDir, setStartOnLogin } from '@/services/vaultRepository'
import type { DesktopLogLevel, DesktopSecuritySettings, ShortcutAction, ShortcutScope } from '@/services/vaultRepository'
import { useVaultStore } from '@/stores/vault'
import type { ManagementPageName } from '../types'

const props = defineProps<{
  activePage: ManagementPageName
  backupBusy?: boolean
}>()

const emit = defineEmits<{
  close: []
  updatePage: [page: ManagementPageName]
  copyValue: [value: string]
  switchUser: [userId: string]
  removeActiveUser: []
  changeLocale: [locale: SupportedLocale]
  changeLogLevel: [level: DesktopLogLevel]
  changeSecuritySettings: [settings: Partial<DesktopSecuritySettings>]
  changeShortcut: [payload: { scope: ShortcutScope; action: ShortcutAction; shortcut: string }]
  resetShortcuts: []
  openLogDir: []
  systemToast: [message: string]
  createBackup: []
  restoreBackup: [file: File]
  importCsv: [file: File]
  exportCsv: []
  importLegacyBackup: [payload: { file: File; password: string }]
  notReady: []
}>()

const { t } = useI18n()
const vaultStore = useVaultStore()
const localDeviceId = computed(() => vaultStore.settings.deviceId ?? '')
const appDataDir = ref('')
const appDataDirLoading = ref(false)
const appDataDirError = ref('')
const backupFileInput = ref<HTMLInputElement | null>(null)
const csvFileInput = ref<HTMLInputElement | null>(null)
const legacyBackupInput = ref<HTMLInputElement | null>(null)
const legacyImportOpen = ref(false)
const legacySelectedFile = ref<File | null>(null)
const legacyPassword = ref('')
const logText = ref('')
const logLoading = ref(false)
const logLoadError = ref('')
const logLevels: DesktopLogLevel[] = ['off', 'error', 'info', 'debug']
const shortcutScope = ref<ShortcutScope>('global')
const capturingShortcut = ref<{ scope: ShortcutScope; action: ShortcutAction } | null>(null)
const shortcutErrors = ref<Record<string, string>>({})
const shortcutChecking = ref<Record<string, boolean>>({})
const startOnLoginSupported = ref(true)
const startOnLoginBusy = ref(false)
const autoLockDelayOptions = [0, 30, 60, 300, 900, 1800, 3600]
const pages = computed<Array<{ name: ManagementPageName; label: string; icon: typeof TriangleAlert }>>(() => [
  { name: 'conflicts', label: t('nav.conflicts'), icon: TriangleAlert },
  { name: 'backup', label: t('nav.backup'), icon: ArchiveRestore },
  { name: 'settings', label: t('nav.settings'), icon: Settings },
  { name: 'shortcuts', label: t('shortcuts.title'), icon: Keyboard },
  { name: 'logs', label: t('logs.title'), icon: Logs },
  { name: 'system', label: t('system.title'), icon: Info }
])
const pageTitle = computed(() => pages.value.find((page) => page.name === props.activePage)?.label ?? t('management.title'))
const visibleShortcutActions = computed(() => shortcutScope.value === 'global' ? GLOBAL_SHORTCUT_ACTIONS : INTERNAL_SHORTCUT_ACTIONS)
const shortcutsAreDefault = computed(() => shortcutSettingsEqual(vaultStore.settings.shortcuts, DEFAULT_SHORTCUT_SETTINGS))
const conflictObjects = computed(() => {
  const vaults = vaultStore.vaults
    .filter((vault) => vault.sync.state === 'conflicted')
    .map((vault) => ({
      id: vault.id,
      title: vault.name,
      detail: vault.description || vault.id,
      type: t('vault.folder'),
      updatedAt: vault.updatedAt
    }))
  const items = vaultStore.items
    .filter((item) => item.sync.state === 'conflicted')
    .map((item) => ({
      id: item.id,
      title: item.title || item.id,
      detail: conflictItemDetail(item),
      type: t(`type.${itemTypeTranslationKey(item.type)}`),
      updatedAt: item.updatedAt
    }))
  const attachments = vaultStore.attachments
    .filter((attachment) => attachment.sync.state === 'conflicted')
    .map((attachment) => ({
      id: attachment.id,
      title: attachment.fileName || attachment.id,
      detail: conflictAttachmentDetail(attachment),
      type: t('type.attachment'),
      updatedAt: attachment.updatedAt
    }))

  return [...vaults, ...items, ...attachments]
})

watch(
  () => props.activePage,
  (page) => {
    if (page === 'system') void loadSystemInfo()
    if (page === 'logs') void loadDesktopLogs()
    if (page === 'settings') void syncStartOnLoginState()
    if (page === 'shortcuts' && shortcutScope.value === 'global') void checkVisibleGlobalShortcuts()
    if (page !== 'shortcuts') stopCapturingShortcut()
  },
  { immediate: true }
)

watch(
  shortcutScope,
  (scope) => {
    if (props.activePage === 'shortcuts' && scope === 'global') void checkVisibleGlobalShortcuts()
  }
)

watch(
  () => JSON.stringify(vaultStore.settings.shortcuts.global),
  () => {
    if (props.activePage === 'shortcuts' && shortcutScope.value === 'global') void checkVisibleGlobalShortcuts()
  }
)

function requestSwitchUser(event: Event): void {
  const select = event.target as HTMLSelectElement
  const userId = select.value
  select.value = vaultStore.activeUserId ?? ''
  emit('switchUser', userId)
}

function itemTypeTranslationKey(type: VaultItem['type']): string {
  if (type === 'payment-card') return 'card'
  if (type === 'secure-note') return 'note'
  if (type === 'recovery-code') return 'recoveryCode'
  return type
}

function conflictItemDetail(item: VaultItem): string {
  const vault = vaultStore.vaults.find((candidate) => candidate.id === item.vaultId)
  return [vault?.name, item.subtitle].filter(Boolean).join(' / ') || item.id
}

function conflictAttachmentDetail(attachment: VaultAttachment): string {
  const item = vaultStore.items.find((candidate) => candidate.id === attachment.itemId)
  const vault = vaultStore.vaults.find((candidate) => candidate.id === attachment.vaultId)
  return [vault?.name, item?.title].filter(Boolean).join(' / ') || attachment.id
}

async function loadSystemInfo(): Promise<void> {
  appDataDirLoading.value = true
  appDataDirError.value = ''
  try {
    appDataDir.value = (await getAppDataDir()) ?? ''
  } catch (error) {
    appDataDir.value = ''
    appDataDirError.value = error instanceof Error ? error.message : t('system.appDataDirFailed')
  } finally {
    appDataDirLoading.value = false
  }
}

async function openLocalStorageDir(): Promise<void> {
  try {
    const path = await openAppDataDir()
    emit('systemToast', path ? t('system.appDataDirOpenSuccess') : t('system.appDataDirBrowserPreview'))
    if (path) appDataDir.value = path
  } catch (error) {
    emit('systemToast', error instanceof Error ? error.message : t('system.appDataDirOpenFailed'))
  }
}

async function loadDesktopLogs(): Promise<void> {
  logLoading.value = true
  logLoadError.value = ''
  try {
    const text = await readDesktopLog()
    logText.value = text ?? ''
    if (text === null) logLoadError.value = t('logs.browserPreview')
  } catch (error) {
    logText.value = ''
    logLoadError.value = error instanceof Error ? error.message : t('logs.failed')
  } finally {
    logLoading.value = false
  }
}

function copyDesktopLogs(): void {
  if (!logText.value) return
  emit('copyValue', logText.value)
}

async function syncStartOnLoginState(): Promise<void> {
  startOnLoginBusy.value = true
  try {
    const enabled = await loadStartOnLogin()
    startOnLoginSupported.value = enabled !== null
    if (enabled !== null && enabled !== vaultStore.settings.security.startOnLogin) {
      emit('changeSecuritySettings', { startOnLogin: enabled })
    }
  } catch {
    startOnLoginSupported.value = false
  } finally {
    startOnLoginBusy.value = false
  }
}

async function changeStartOnLogin(event: Event): Promise<void> {
  const enabled = (event.target as HTMLInputElement).checked
  startOnLoginBusy.value = true
  try {
    const applied = await setStartOnLogin(enabled)
    startOnLoginSupported.value = applied !== null
    emit('changeSecuritySettings', { startOnLogin: applied ?? enabled })
    if (applied === null) emit('systemToast', t('settings.startOnLoginUnsupported'))
  } catch {
    emit('systemToast', t('settings.startOnLoginFailed'))
    emit('changeSecuritySettings', { startOnLogin: !enabled })
  } finally {
    startOnLoginBusy.value = false
  }
}

function changeAutoLockDelay(event: Event): void {
  const autoLockDelaySeconds = Number((event.target as HTMLSelectElement).value)
  emit('changeSecuritySettings', {
    autoLockOnLimit: autoLockDelaySeconds > 0,
    autoLockDelaySeconds
  })
}

function autoLockDelayLabel(seconds: number): string {
  if (seconds === 0) return t('settings.autoLockOff')
  if (seconds < 60) return t('settings.seconds', { count: seconds })
  return t('settings.minutes', { count: seconds / 60 })
}

function openFilePicker(input: HTMLInputElement | null): void {
  if (props.backupBusy) return
  input?.click()
}

function openLegacyImport(): void {
  if (props.backupBusy) return
  legacySelectedFile.value = null
  legacyPassword.value = ''
  legacyImportOpen.value = true
}

function closeLegacyImport(): void {
  if (props.backupBusy) return
  legacyImportOpen.value = false
  legacySelectedFile.value = null
  legacyPassword.value = ''
}

function backToLegacyFileStep(): void {
  if (props.backupBusy) return
  legacySelectedFile.value = null
  legacyPassword.value = ''
}

function onBackupFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('restoreBackup', file)
  input.value = ''
}

function onCsvFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('importCsv', file)
  input.value = ''
}

function onLegacyBackupSelected(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) legacySelectedFile.value = file
  input.value = ''
}

function submitLegacyImport(): void {
  if (!legacySelectedFile.value) {
    openFilePicker(legacyBackupInput.value)
    return
  }

  if (!legacyPassword.value) {
    emit('systemToast', t('backup.legacyPasswordRequired'))
    return
  }

  emit('importLegacyBackup', { file: legacySelectedFile.value, password: legacyPassword.value })
  legacyImportOpen.value = false
  legacySelectedFile.value = null
  legacyPassword.value = ''
}

function shortcutValue(scope: ShortcutScope, action: ShortcutAction): string {
  return normalizeShortcut(String(vaultStore.settings.shortcuts[scope][action as never] ?? ''))
}

function shortcutKey(scope: ShortcutScope, action: ShortcutAction): string {
  return `${scope}:${action}`
}

function shortcutLabel(action: ShortcutAction): string {
  return t(`shortcuts.actions.${action}`)
}

function shortcutScopeLabel(scope: ShortcutScope): string {
  return t(`shortcuts.${scope}`)
}

function shortcutCapturePlaceholder(scope: ShortcutScope, action: ShortcutAction): string {
  return isCapturingShortcut(scope, action) ? t('shortcuts.recording') : ''
}

function isCapturingShortcut(scope: ShortcutScope, action: ShortcutAction): boolean {
  return capturingShortcut.value?.scope === scope && capturingShortcut.value.action === action
}

function startCapturingShortcut(scope: ShortcutScope, action: ShortcutAction): void {
  capturingShortcut.value = { scope, action }
  clearShortcutError(scope, action)
}

function stopCapturingShortcut(): void {
  capturingShortcut.value = null
}

async function checkVisibleGlobalShortcuts(): Promise<void> {
  await Promise.all(
    GLOBAL_SHORTCUT_ACTIONS.map(async (action) => {
      const scope: ShortcutScope = 'global'
      const key = shortcutKey(scope, action)
      const shortcut = shortcutValue(scope, action)
      shortcutChecking.value = { ...shortcutChecking.value, [key]: true }
      try {
        if (!isShortcutValid(shortcut, scope)) {
          setShortcutError(scope, action, t('shortcuts.globalShortcutInvalid'))
          return
        }
        const conflict = await findShortcutConflict(scope, action, shortcut, vaultStore.settings.shortcuts)
        if (conflict?.type === 'duplicate' && conflict.action) {
          setShortcutError(scope, action, t('shortcuts.duplicateConflict', { action: shortcutLabel(conflict.action) }))
          return
        }
        if (conflict?.type === 'system') {
          setShortcutError(scope, action, t('shortcuts.systemConflict'))
          return
        }
        clearShortcutError(scope, action)
      } finally {
        const next = { ...shortcutChecking.value }
        delete next[key]
        shortcutChecking.value = next
      }
    })
  )
}

async function recordShortcut(event: KeyboardEvent, scope: ShortcutScope, action: ShortcutAction): Promise<void> {
  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') {
    stopCapturingShortcut()
    return
  }

  const shortcut = formatShortcutFromEvent(event)
  if (!shortcut) return

  if (!isShortcutValid(shortcut, scope)) {
    setShortcutError(scope, action, scope === 'global' ? t('shortcuts.globalShortcutInvalid') : t('shortcuts.internalShortcutInvalid'))
    return
  }

  const conflict = await findShortcutConflict(scope, action, shortcut, vaultStore.settings.shortcuts)
  if (conflict?.type === 'duplicate' && conflict.action) {
    setShortcutError(scope, action, t('shortcuts.duplicateConflict', { action: shortcutLabel(conflict.action) }))
    return
  }
  if (conflict?.type === 'system') {
    setShortcutError(scope, action, t('shortcuts.systemConflict'))
    return
  }

  clearShortcutError(scope, action)
  stopCapturingShortcut()
  emit('changeShortcut', { scope, action, shortcut })
}

function resetShortcuts(): void {
  shortcutErrors.value = {}
  stopCapturingShortcut()
  emit('resetShortcuts')
}

function setShortcutError(scope: ShortcutScope, action: ShortcutAction, message: string): void {
  shortcutErrors.value = {
    ...shortcutErrors.value,
    [shortcutKey(scope, action)]: message
  }
}

function clearShortcutError(scope: ShortcutScope, action: ShortcutAction): void {
  const key = shortcutKey(scope, action)
  if (!shortcutErrors.value[key]) return
  const next = { ...shortcutErrors.value }
  delete next[key]
  shortcutErrors.value = next
}
</script>

<template>
  <section class="grid min-h-0 grid-cols-[240px_minmax(0,1fr)] bg-[#f7f8fa]">
    <aside class="flex min-h-0 flex-col border-r border-slate-200 bg-white">
      <div class="flex min-h-16 items-center justify-between border-b border-slate-200 px-4">
        <div class="leading-tight">
          <h2 class="font-bold text-slate-950">{{ t('management.title') }}</h2>
          <small class="text-xs text-slate-500">{{ t('app.subtitle') }}</small>
        </div>
        <button class="icon-button" type="button" :title="t('management.close')" :aria-label="t('management.close')" @click="emit('close')">
          <X class="size-4" />
        </button>
      </div>
      <nav class="grid gap-1 p-3">
        <button
          v-for="page in pages"
          :key="page.name"
          class="grid min-h-11 grid-cols-[24px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
          :class="{ 'bg-teal-50 text-teal-900 hover:bg-teal-50': activePage === page.name }"
          type="button"
          @click="emit('updatePage', page.name)"
        >
          <component :is="page.icon" class="size-4" />
          <span>{{ page.label }}</span>
        </button>
      </nav>
    </aside>

    <div class="grid min-h-0 grid-rows-[64px_minmax(0,1fr)]">
      <header class="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 class="text-lg font-bold text-slate-950">{{ pageTitle }}</h1>
        <button class="plain-button" type="button" @click="emit('close')">{{ t('management.backToVault') }}</button>
      </header>

      <main class="min-h-0 overflow-auto p-6">
        <div v-if="activePage === 'conflicts'" class="grid max-w-3xl gap-4">
          <div v-if="conflictObjects.length === 0" class="grid gap-2 rounded-lg border border-slate-200 bg-white p-5">
            <strong>{{ t('drawer.conflictsEmptyTitle') }}</strong>
            <span class="text-sm text-slate-500">{{ t('drawer.conflictsEmptyBody') }}</span>
          </div>
          <div v-else class="grid gap-3">
            <div class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {{ t('sync.conflictedBody', { count: conflictObjects.length }) }}
            </div>
            <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div
                v-for="object in conflictObjects"
                :key="object.id"
                class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
              >
                <div class="min-w-0">
                  <div class="flex min-w-0 items-center gap-2">
                    <strong class="truncate text-sm text-slate-950">{{ object.title }}</strong>
                    <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{{ object.type }}</span>
                  </div>
                  <p class="mt-1 truncate text-xs text-slate-500">{{ object.detail }}</p>
                  <code class="mt-1 block truncate font-mono text-[11px] text-slate-400">{{ object.id }}</code>
                </div>
                <span class="text-right text-xs text-slate-500">{{ new Date(object.updatedAt).toLocaleString(vaultStore.settings.locale) }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activePage === 'backup'" class="grid max-w-3xl gap-4">
          <p class="text-sm text-slate-500">{{ t('drawer.backupBody') }}</p>
          <div class="grid grid-cols-2 gap-3">
            <button class="action-card" type="button" :disabled="backupBusy" @click="emit('createBackup')">
              <span class="action-icon"><PackagePlus class="size-4" /></span>
              <span><strong>{{ t('drawer.createBackup') }}</strong><small>{{ t('backup.exportHint') }}</small></span>
            </button>
            <button class="action-card" type="button" :disabled="backupBusy" @click="openFilePicker(backupFileInput)">
              <span class="action-icon"><ArchiveRestore class="size-4" /></span>
              <span><strong>{{ t('drawer.restoreBackup') }}</strong><small>{{ t('backup.restoreHint') }}</small></span>
            </button>

            <button class="action-card" type="button" :disabled="backupBusy" @click="openLegacyImport">
              <span class="action-icon"><DatabaseBackup class="size-4" /></span>
              <span>
                <strong>{{ t('drawer.importLegacy') }}</strong>
                <small>{{ t('backup.legacyHint') }}</small>
              </span>
            </button>

            <section class="action-card cursor-default items-start">
              <span class="action-icon"><FileSpreadsheet class="size-4" /></span>
              <span class="grid min-w-0 gap-2">
                <span>
                  <strong>{{ t('drawer.importCsv') }}</strong>
                  <small>{{ t('backup.csvHint') }}</small>
                </span>
                <span class="flex flex-wrap gap-2">
                  <button class="plain-button" type="button" :disabled="backupBusy" @click="openFilePicker(csvFileInput)">{{ t('backup.importCsv') }}</button>
                  <button class="plain-button" type="button" :disabled="backupBusy" @click="emit('exportCsv')">{{ t('backup.exportCsv') }}</button>
                </span>
              </span>
            </section>
          </div>
          <input ref="backupFileInput" class="hidden" type="file" accept=".lpbackup,.json,.lpbackup.json,application/json" @change="onBackupFileSelected" />
          <input ref="csvFileInput" class="hidden" type="file" accept=".csv,text/csv" @change="onCsvFileSelected" />
          <input ref="legacyBackupInput" class="hidden" type="file" accept=".zip,application/zip,application/x-zip-compressed" @change="onLegacyBackupSelected" />
        </div>

        <div v-else-if="activePage === 'settings'" class="grid max-w-3xl gap-6">
          <section class="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
            <label class="form-label">
              {{ t('user.currentUser') }}
              <select class="form-input" :value="vaultStore.activeUserId ?? ''" @change="requestSwitchUser">
                <option v-for="user in vaultStore.users" :key="user.id" :value="user.id">{{ user.displayName }}</option>
              </select>
            </label>

            <div class="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-xs font-bold text-slate-500">{{ t('settings.localDeviceId') }}</span>
              <div v-if="localDeviceId" class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <code class="min-w-0 break-all font-mono text-xs text-slate-700">{{ localDeviceId }}</code>
                <button class="icon-button" type="button" :title="t('settings.copy')" :aria-label="t('settings.copy')" @click="emit('copyValue', localDeviceId)">
                  <Copy class="size-4" />
                </button>
              </div>
              <span v-else class="text-sm text-slate-400">{{ t('settings.localDeviceIdMissing') }}</span>
            </div>

            <button class="danger-button justify-self-start" type="button" @click="emit('removeActiveUser')">
              <UserMinus class="size-4" />
              {{ t('settings.removeUserEntry') }}
            </button>
          </section>

          <section class="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
            <label class="form-label">
              {{ t('settings.language') }}
              <select class="form-input" :value="vaultStore.settings.locale" @change="emit('changeLocale', ($event.target as HTMLSelectElement).value as SupportedLocale)">
                <option v-for="locale in supportedLocales" :key="locale" :value="locale">{{ localeLabels[locale] }}</option>
              </select>
            </label>
          </section>

          <section class="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
            <div class="flex items-center gap-2 font-bold">
              <Logs class="size-4" />
              {{ t('settings.logging') }}
            </div>
            <label class="form-label">
              {{ t('settings.logLevel') }}
              <select class="form-input" :value="vaultStore.settings.logging.level" @change="emit('changeLogLevel', ($event.target as HTMLSelectElement).value as DesktopLogLevel)">
                <option v-for="level in logLevels" :key="level" :value="level">{{ t(`settings.logLevel${level[0].toUpperCase()}${level.slice(1)}`) }}</option>
              </select>
              <small class="text-xs leading-5 text-slate-500">{{ t('settings.loggingHint') }}</small>
            </label>
            <button class="plain-button justify-self-start" type="button" @click="emit('openLogDir')">
              <FolderOpen class="size-4" />
              {{ t('settings.openLogDir') }}
            </button>
          </section>

          <section class="rounded-lg border border-slate-200 bg-white p-5">
            <div class="mb-2 flex items-center gap-2 font-bold">
              <Shield class="size-4" />
              {{ t('settings.security') }}
            </div>
            <label class="setting-row">
              <span>
                <strong>{{ t('settings.startOnLogin') }}</strong>
                <small>{{ startOnLoginSupported ? t('settings.startOnLoginHint') : t('settings.startOnLoginUnsupported') }}</small>
              </span>
              <input
                type="checkbox"
                :checked="vaultStore.settings.security.startOnLogin"
                :disabled="startOnLoginBusy || !startOnLoginSupported"
                @change="changeStartOnLogin"
              />
            </label>
            <label class="setting-row">
              <span>
                <strong>{{ t('settings.autoLock') }}</strong>
                <small>{{ t('settings.autoLockHint') }}</small>
              </span>
              <select class="form-input max-w-44" :value="vaultStore.settings.security.autoLockOnLimit ? vaultStore.settings.security.autoLockDelaySeconds : 0" @change="changeAutoLockDelay">
                <option v-for="seconds in autoLockDelayOptions" :key="seconds" :value="seconds">{{ autoLockDelayLabel(seconds) }}</option>
              </select>
            </label>
            <label class="setting-row"><span><strong>{{ t('settings.clearClipboard') }}</strong><small>{{ t('settings.clearClipboardHint') }}</small></span><input type="checkbox" checked /></label>
          </section>
        </div>

        <div v-else-if="activePage === 'shortcuts'" class="grid max-w-4xl gap-4">
          <section class="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="grid gap-1">
                <h2 class="font-bold text-slate-950">{{ t('shortcuts.title') }}</h2>
                <p class="text-sm leading-6 text-slate-500">{{ t('shortcuts.body') }}</p>
              </div>
              <button class="plain-button" type="button" :disabled="shortcutsAreDefault" @click="resetShortcuts">
                <RotateCcw class="size-4" />
                {{ t('shortcuts.restoreDefaults') }}
              </button>
            </div>

            <div class="inline-grid grid-cols-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button
                v-for="scope in ['global', 'internal'] as ShortcutScope[]"
                :key="scope"
                class="rounded-md px-3 py-2 text-sm font-bold"
                :class="shortcutScope === scope ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500 hover:text-slate-950'"
                type="button"
                @click="shortcutScope = scope"
              >
                {{ shortcutScopeLabel(scope) }}
              </button>
            </div>

            <div class="overflow-hidden rounded-lg border border-slate-200">
              <div class="grid grid-cols-[minmax(160px,220px)_minmax(220px,1fr)] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black text-slate-500">
                <span>{{ t('shortcuts.action') }}</span>
                <span>{{ t('shortcuts.shortcut') }}</span>
              </div>
              <div
                v-for="action in visibleShortcutActions"
                :key="action"
                class="grid grid-cols-[minmax(160px,220px)_minmax(220px,1fr)] gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
              >
                <div class="grid content-center gap-1">
                  <strong class="text-sm text-slate-950">{{ shortcutLabel(action) }}</strong>
                  <small class="text-xs text-slate-500">{{ t(`shortcuts.hints.${action}`) }}</small>
                </div>
                <div class="grid gap-1">
                  <input
                    class="form-input font-mono"
                    :class="{ 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10': shortcutErrors[shortcutKey(shortcutScope, action)] }"
                    :value="isCapturingShortcut(shortcutScope, action) ? '' : shortcutValue(shortcutScope, action)"
                    :placeholder="shortcutCapturePlaceholder(shortcutScope, action)"
                    readonly
                    @focus="startCapturingShortcut(shortcutScope, action)"
                    @click="startCapturingShortcut(shortcutScope, action)"
                    @keydown="recordShortcut($event, shortcutScope, action)"
                    @blur="stopCapturingShortcut"
                  />
                  <span v-if="shortcutErrors[shortcutKey(shortcutScope, action)]" class="text-xs font-semibold text-rose-700">
                    {{ shortcutErrors[shortcutKey(shortcutScope, action)] }}
                  </span>
                  <span v-else-if="shortcutChecking[shortcutKey(shortcutScope, action)]" class="text-xs text-slate-400">{{ t('shortcuts.checkingConflict') }}</span>
                  <span v-else class="text-xs text-slate-400">{{ t('shortcuts.inputHint') }}</span>
                </div>
              </div>
            </div>

            <p v-if="shortcutScope === 'global'" class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              {{ t('shortcuts.globalConflictHint') }}
            </p>
          </section>
        </div>

        <div v-else-if="activePage === 'logs'" class="grid max-w-5xl gap-4">
          <section class="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="grid gap-1">
                <h2 class="font-bold text-slate-950">{{ t('logs.title') }}</h2>
                <p class="text-sm leading-6 text-slate-500">{{ t('logs.body') }}</p>
              </div>
              <div class="flex flex-wrap gap-2">
                <button class="plain-button" type="button" :disabled="logLoading" @click="loadDesktopLogs">
                  <RefreshCw class="size-4" />
                  {{ t('logs.refresh') }}
                </button>
                <button class="plain-button" type="button" :disabled="!logText" @click="copyDesktopLogs">
                  <Copy class="size-4" />
                  {{ t('logs.copy') }}
                </button>
                <button class="plain-button" type="button" @click="emit('openLogDir')">
                  <FolderOpen class="size-4" />
                  {{ t('settings.openLogDir') }}
                </button>
              </div>
            </div>

            <div class="overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
              <pre v-if="logText" class="max-h-[560px] min-h-[320px] overflow-auto p-4 font-mono text-xs leading-5 text-slate-100">{{ logText }}</pre>
              <div v-else class="grid min-h-[320px] place-items-center p-6 text-center text-sm text-slate-300">
                <span v-if="logLoading">{{ t('logs.loading') }}</span>
                <span v-else-if="logLoadError" class="text-rose-200">{{ logLoadError }}</span>
                <span v-else>{{ t('logs.empty') }}</span>
              </div>
            </div>
          </section>
        </div>

        <div v-else class="grid max-w-3xl gap-6">
          <section class="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
            <div class="grid gap-1">
              <h2 class="font-bold text-slate-950">{{ t('system.storageTitle') }}</h2>
              <p class="text-sm text-slate-500">{{ t('system.storageBody') }}</p>
            </div>

            <div class="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span class="text-xs font-bold text-slate-500">{{ t('system.appDataDir') }}</span>
              <div v-if="appDataDir" class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                <code class="min-w-0 break-all font-mono text-xs text-slate-700">{{ appDataDir }}</code>
                <button class="icon-button" type="button" :title="t('settings.copy')" :aria-label="t('settings.copy')" @click="emit('copyValue', appDataDir)">
                  <Copy class="size-4" />
                </button>
              </div>
              <span v-else-if="appDataDirLoading" class="text-sm text-slate-400">{{ t('system.loading') }}</span>
              <span v-else-if="appDataDirError" class="text-sm text-rose-700">{{ appDataDirError }}</span>
              <span v-else class="text-sm text-slate-400">{{ t('system.appDataDirBrowserPreview') }}</span>
            </div>

            <button class="plain-button justify-self-start" type="button" @click="openLocalStorageDir">
              <FolderOpen class="size-4" />
              {{ t('system.openAppDataDir') }}
            </button>
          </section>
        </div>
      </main>
    </div>

    <div v-if="legacyImportOpen" class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40">
      <section class="w-[460px] max-w-[94vw] rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
          <h3 class="font-bold">{{ t('drawer.importLegacy') }}</h3>
          <button class="icon-button" type="button" :disabled="backupBusy" @click="closeLegacyImport">
            <X class="size-4" />
          </button>
        </div>

        <div v-if="!legacySelectedFile" class="grid gap-4 p-4">
          <div class="grid gap-2">
            <span class="grid size-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <DatabaseBackup class="size-5" />
            </span>
            <strong class="text-lg text-slate-950">{{ t('backup.legacyPickTitle') }}</strong>
            <p class="text-sm text-slate-500">{{ t('backup.legacyPickBody') }}</p>
          </div>
          <button class="primary-button justify-self-start" type="button" :disabled="backupBusy" @click="openFilePicker(legacyBackupInput)">
            {{ t('backup.selectLegacyBackup') }}
          </button>
        </div>

        <div v-else class="grid gap-4 p-4">
          <button class="plain-button justify-self-start" type="button" :disabled="backupBusy" @click="backToLegacyFileStep">
            <ArrowLeft class="size-4" />
            {{ t('backup.legacyPickAgain') }}
          </button>
          <div class="grid gap-2">
            <span class="grid size-10 place-items-center rounded-lg bg-teal-50 text-teal-700">
              <LockKeyhole class="size-5" />
            </span>
            <strong class="text-lg text-slate-950">{{ t('backup.legacyPasswordTitle') }}</strong>
            <p class="break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {{ legacySelectedFile.name }}
            </p>
          </div>
          <label class="form-label">
            {{ t('backup.legacyPassword') }}
            <input
              v-model="legacyPassword"
              class="form-input"
              type="password"
              autocomplete="current-password"
              autofocus
              :placeholder="t('backup.legacyPassword')"
              @keydown.enter.prevent="submitLegacyImport"
            />
          </label>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button class="plain-button" type="button" :disabled="backupBusy" @click="closeLegacyImport">{{ t('editor.cancel') }}</button>
          <button
            class="primary-button"
            type="button"
            :disabled="backupBusy || !legacySelectedFile"
            @click="submitLegacyImport"
          >
            {{ backupBusy ? t('backup.importing') : t('backup.startLegacyImport') }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
