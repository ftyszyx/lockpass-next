import { defineStore } from 'pinia'
import type {
  SyncMetadata,
  Vault,
  VaultAttachment,
  VaultColor,
  VaultItem,
  VaultItemField,
  VaultItemType
} from '@lockpass/core'
import { desktopMessages, supportedLocales, type SupportedLocale } from '@/i18n'
import { detectBrowserLocale, loadSystemLocale } from '@/services/locale'
import { createPerfTrace } from '@/services/perfTrace'
import { configuredOfficialApiUrl, configuredOfficialServerUrl } from '@/services/appConfig'
import { configureLogger, logDebug, logError, logInfo } from '@/services/logger'
import { DEFAULT_SHORTCUT_SETTINGS, normalizeShortcut, normalizeShortcutSettings } from '@/services/shortcuts'
import {
  createDeviceFastUnlock,
  createUserCrypto,
  decryptSyncObjectPayload,
  encryptSyncObjectPayload,
  unlockUserCryptoWithDeviceUnlockKey,
  unlockUserCrypto,
  type DesktopVaultPayload,
  type EncryptedSyncObjectPayload,
  type SyncVaultObjectType
} from '@/services/masterPassword'
import { vaultItemMatchesSearch } from '@/services/search'
import {
  normalizeSyncServerUrl,
  SyncApiError,
  SyncApiClient,
  type SyncDeviceBindResponse,
  type SyncDeviceBindCallbackPayload,
  type SyncMode,
  type SyncObjectView,
  type SyncPushObject
} from '@/services/syncClient'
import {
  clearAttachmentBlobCache,
  countEncryptedObjectsByVault,
  deleteDeviceUnlockKey,
  deleteRecoveryKey,
  deleteAttachmentBlobRef,
  deleteSyncDeviceToken,
  loadDeviceUnlockCapability,
  loadDeviceUnlockKey,
  loadAttachmentBlobBytes,
  loadRecoveryKey,
  loadSyncDeviceToken,
  loadVaultStore,
  migrateLegacyAttachmentBlob,
  queryEncryptedObjects,
  saveDeviceUnlockKey,
  saveEncryptedAttachmentBlob,
  saveEncryptedObjects,
  saveRecoveryKey,
  saveSyncDeviceToken,
  saveVaultStore,
  upsertEncryptedObjects,
  type DesktopLoggingSettings,
  type DesktopLayoutSettings,
  type DesktopLogLevel,
  type DesktopSecuritySettings,
  type DesktopShortcutSettings,
  type ShortcutAction,
  type ShortcutScope,
  type DesktopSyncSettings,
  type DesktopUserProfile,
  type DesktopVaultStoreData,
  type EncryptedObjectRecord,
  type SecureRecoveryKeyResult,
  type StorageBackend
} from '@/services/vaultRepository'
import type { ExternalImportItem, ExternalImportVault, LockPassBackupPackageV1 } from '@/services/backup'
import { base64ToBytes, bytesToBase64, exportItemsToCsv } from '@/services/backup'

export type SelectedType = 'all' | VaultItemType

export interface AttachmentDraft {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  encryptedBlobRef: string
  state: VaultAttachment['state']
  previewFile?: File
}

export interface SaveItemPayload {
  editingItemId: string | null
  type: VaultItemType
  vaultId: string
  title: string
  notes: string
  fields: VaultItemField[]
  attachments: AttachmentDraft[]
}

export interface CreateVaultPayload {
  name: string
  description: string
  color: VaultColor
  icon: string
}

export interface CreateUserPayload {
  username: string
  password: string
  recoveryKey?: string
  sync?: Pick<SyncConnectPayload, 'mode' | 'serverUrl'>
}

export interface CreateUserResult {
  user: DesktopUserProfile
  recoveryKey: string
  recoveryKeyStorage: 'saved' | 'unsupported' | 'failed'
}

export interface SyncConnectPayload {
  mode: SyncMode
  serverUrl: string
}

export interface OfficialSyncAuthorization {
  loginUrl: string
}

export type PendingSyncDeviceBindExchange = SyncDeviceBindCallbackPayload

export interface SyncRunResult {
  pushed: number
  pulled: number
  conflicts: number
  rejected: number
  rejectedCodes: string[]
  cursor: number
  recoveredFromSnapshot?: boolean
}

export interface ImportItemsResult {
  imported: number
  skipped: number
  vaultName: string
}

export interface ImportVaultsResult {
  imported: number
  skipped: number
  vaults: number
}

type RecoveryKeyStorageStatus = CreateUserResult['recoveryKeyStorage']
type SessionUnlockResult = 'unlocked' | 'invalid' | 'unavailable'

interface SessionUnlockCache {
  userId: string
  keyId: string
  vaultKey: Uint8Array
  verifierSalt: string
  verifierHash: string
  createdAt: string
  lastUsedAt: string
}

const CORE_SCHEMA_VERSION = 1
const DESKTOP_STORE_SCHEMA_VERSION = 2
const DEFAULT_LAYOUT: DesktopLayoutSettings = {
  sidebarWidth: 236,
  itemListWidth: 358
}
const DEFAULT_LOGGING_SETTINGS: DesktopLoggingSettings = {
  level: 'error'
}
const DEFAULT_SHORTCUTS: DesktopShortcutSettings = DEFAULT_SHORTCUT_SETTINGS
const DEFAULT_SECURITY_SETTINGS: DesktopSecuritySettings = {
  startOnLogin: false,
  autoLockOnLimit: true,
  autoLockDelaySeconds: 300
}
const LEGACY_DEFAULT_SELF_HOST_SYNC_SERVER_URL = 'http://127.0.0.1:1480'
const DEFAULT_SYNC_SETTINGS: DesktopSyncSettings = {
  mode: 'official',
  serverUrl: '',
  syncSpaceId: null,
  accountId: null,
  accountLabel: null,
  deviceId: null,
  cursor: 0,
  connectedAt: null,
  lastSyncAt: null
}

export const useVaultStore = defineStore('vault', {
  state: () => ({
    hydrated: false,
    saving: false,
    storageBackend: 'browser' as StorageBackend,
    storageError: '',
    passwordlessUnlockSupported: false,
    users: [] as DesktopUserProfile[],
    activeUserId: null as string | null,
    unlocked: false,
    vaultKey: null as Uint8Array | null,
    activeKeyId: null as string | null,
    sessionUnlockCache: null as SessionUnlockCache | null,
    vaults: [] as Vault[],
    items: [] as VaultItem[],
    attachments: [] as VaultAttachment[],
    loadedVaultIds: [] as string[],
    vaultItemCounts: {} as Record<string, number>,
    selectedVaultId: 'all' as 'all' | string,
    selectedItemId: null as string | null,
    selectedType: 'all' as SelectedType,
    query: '',
    settings: {
      locale: detectBrowserLocale(),
      deviceId: '',
      layout: { ...DEFAULT_LAYOUT },
      logging: { ...DEFAULT_LOGGING_SETTINGS },
      shortcuts: normalizeShortcutSettings(DEFAULT_SHORTCUTS),
      security: { ...DEFAULT_SECURITY_SETTINGS },
      sync: { ...DEFAULT_SYNC_SETTINGS }
    },
    officialLogin: {
      inProgress: false,
      exchangeCode: null as string | null,
      lastError: ''
    },
    autoSync: {
      running: false,
      lastError: '',
      lastAttemptAt: null as string | null
    },
    legacyPayloads: {} as Record<string, DesktopVaultPayload>
  }),
  getters: {
    hasUsers: (state) => state.users.length > 0,
    activeUser: (state) => {
      return state.users.find((user) => user.id === state.activeUserId) ?? state.users[0] ?? null
    },
    needsUserSetup: (state) => {
      const activeUser = state.users.find((user) => user.id === state.activeUserId) ?? state.users[0] ?? null
      return state.users.length === 0 || !activeUser?.crypto
    },
    visibleVaults: (state) => state.vaults.filter((vault) => !vault.sync.deletedAt),
    visibleItems: (state) => state.items.filter((item) => !item.sync.deletedAt),
    writableVaults: (state) => state.vaults.filter((vault) => !vault.sync.deletedAt),
    visibleAttachments: (state) => state.attachments.filter((attachment) => !attachment.sync.deletedAt),
    selectedItem: (state) => {
      return state.items.find((item) => !item.sync.deletedAt && item.id === state.selectedItemId)
        ?? state.items.find((item) => !item.sync.deletedAt)
        ?? null
    },
    selectedItemAttachments: (state) => {
      const item = state.items.find((candidate) => !candidate.sync.deletedAt && candidate.id === state.selectedItemId)
        ?? state.items.find((candidate) => !candidate.sync.deletedAt)
      if (!item) return []
      return state.attachments.filter((attachment) => !attachment.sync.deletedAt && item.attachmentIds.includes(attachment.id))
    },
    filteredItems: (state) => {
      return state.items.filter((item) => {
        if (item.sync.deletedAt) return false
        const matchesVault = state.selectedVaultId === 'all' || item.vaultId === state.selectedVaultId
        const matchesType =
          state.selectedType === 'all' ||
          item.type === state.selectedType
        return matchesVault && matchesType && vaultItemMatchesSearch(item, state.query, state.attachments)
      })
    },
    quickResults: (state) => {
      return state.items.filter((item) => !item.sync.deletedAt && vaultItemMatchesSearch(item, state.query, state.attachments))
    },
    syncConnected: (state) => Boolean(state.settings.sync.deviceId && state.settings.sync.syncSpaceId),
    syncLocalChangeCount: (state) => {
      return [...state.vaults, ...state.items, ...state.attachments].filter((object) =>
        object.sync.state === 'dirty' || object.sync.state === 'pending'
      ).length
    },
    syncConflictCount: (state) => {
      return [...state.vaults, ...state.items, ...state.attachments].filter((object) => object.sync.state === 'conflicted').length
    },
    syncHostLabel: (state) => {
      const serverUrl = state.settings.sync.mode === 'official'
        ? configuredOfficialServerUrl()
        : state.settings.sync.serverUrl
      return serverUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')
    },
    vaultCount: (state) => {
      return (vaultId: string | 'all') => {
        if (vaultId === 'all') return Object.values(state.vaultItemCounts).reduce((total, count) => total + count, 0)
        return state.vaultItemCounts[vaultId] ?? 0
      }
    }
  },
  actions: {
    async hydrate() {
      this.hydrated = false
      this.storageError = ''
      try {
        await logDebug('vault hydrate started')
        const [loaded, systemLocale, deviceUnlockCapability] = await Promise.all([
          loadVaultStore(),
          loadSystemLocale(),
          loadDeviceUnlockCapability().catch(() => ({
            supportsPasswordless: false,
            requiresUserPresence: false,
            provider: 'unavailable',
            reason: 'capability-check-failed'
          }))
        ])
        this.storageBackend = loaded.backend
        this.passwordlessUnlockSupported = deviceUnlockCapability.supportsPasswordless && deviceUnlockCapability.requiresUserPresence
        const normalized = normalizeLoadedData(loaded.data, systemLocale)
        const data = normalized.data
        if (!this.passwordlessUnlockSupported) {
          await deleteFastUnlockSecretsForUsers(data.users)
          data.users = data.users.map(stripFastUnlockFromUser)
        }
        if (loaded.data && !normalized.hasLegacyPlaintext) {
          await saveVaultStore(data)
        }

        this.legacyPayloads = normalized.legacyPayloads
        this.users = data.users
        this.activeUserId = data.activeUserId
        this.settings = data.settings
        configureLogger(this.settings.logging.level)
        this.clearSessionData()

        this.selectedItemId = this.items[0]?.id ?? null
        this.hydrated = true
        await logInfo('vault hydrate completed', {
          backend: loaded.backend,
          users: data.users.length,
          activeUser: Boolean(data.activeUserId),
          passwordlessUnlockSupported: this.passwordlessUnlockSupported
        })
      } catch (error) {
        this.storageError = error instanceof Error ? error.message : String(error)
        await logError('vault hydrate failed', { error: this.storageError })
        const fallback = normalizeLoadedData(null, detectBrowserLocale()).data
        configureLogger(fallback.settings.logging.level)
        this.passwordlessUnlockSupported = false
        this.legacyPayloads = {}
        this.users = []
        this.activeUserId = null
        this.clearSessionData()
        this.settings = fallback.settings
      }
    },
    async persist() {
      this.saving = true
      this.storageError = ''

      try {
        const users = snapshotActiveUser(this.users, this.activeUserId, this.settings.sync)
        this.users = users

        if (this.activeUserId && this.vaultKey && this.activeKeyId) {
          await upsertEncryptedObjects(
            this.activeUserId,
            await buildLocalEncryptedObjectRecords({
              vaultKey: this.vaultKey,
              keyId: this.activeKeyId,
              vaults: this.vaults,
              items: this.items,
              attachments: this.attachments
            })
          )
        }

        await saveVaultStore({
          schemaVersion: DESKTOP_STORE_SCHEMA_VERSION,
          activeUserId: this.activeUserId,
          users,
          settings: this.settings
        })
      } catch (error) {
        this.storageError = error instanceof Error ? error.message : String(error)
        await logError('vault persist failed', { error: this.storageError })
      } finally {
        this.saving = false
      }
    },
    async setLocale(locale: SupportedLocale) {
      this.settings.locale = locale
      await this.persist()
    },
    async setLayout(layout: Partial<DesktopLayoutSettings>, options: { persist?: boolean } = {}) {
      this.settings.layout = {
        ...this.settings.layout,
        ...layout
      }

      if (options.persist ?? true) {
        await this.persist()
      }
    },
    async setLogLevel(level: DesktopLogLevel) {
      this.settings.logging = normalizeLoggingSettings({ level })
      configureLogger(this.settings.logging.level)
      await this.persist()
      await logInfo('desktop log level changed', { level: this.settings.logging.level })
    },
    async setShortcut(scope: ShortcutScope, action: ShortcutAction, shortcut: string) {
      const normalized = normalizeShortcut(shortcut)
      if (!normalized) throw new Error('shortcutInvalid')
      this.settings.shortcuts = normalizeShortcutSettings({
        ...this.settings.shortcuts,
        [scope]: {
          ...this.settings.shortcuts[scope],
          [action]: normalized
        }
      })
      await this.persist()
      await logInfo('desktop shortcut changed', { scope, action, shortcut: normalized })
    },
    async resetShortcuts() {
      this.settings.shortcuts = normalizeShortcutSettings(DEFAULT_SHORTCUTS)
      await this.persist()
      await logInfo('desktop shortcuts reset')
    },
    async saveSecuritySettings(input: Partial<DesktopSecuritySettings>) {
      this.settings.security = normalizeSecuritySettings({
        ...this.settings.security,
        ...input
      })
      await this.persist()
      await logInfo('desktop security settings changed', {
        startOnLogin: this.settings.security.startOnLogin,
        autoLockOnLimit: this.settings.security.autoLockOnLimit,
        autoLockDelaySeconds: this.settings.security.autoLockDelaySeconds
      })
    },
    async saveSyncSettings(input: Pick<SyncConnectPayload, 'mode' | 'serverUrl'>) {
      const serverUrl = input.mode === 'official'
        ? configuredOfficialApiUrl()
        : requireSelfHostServerUrl(input.serverUrl)
      const changedConnectionTarget = this.settings.sync.mode !== input.mode || this.settings.sync.serverUrl !== serverUrl
      const sync = changedConnectionTarget
        ? { ...DEFAULT_SYNC_SETTINGS, mode: input.mode, serverUrl }
        : { ...this.settings.sync, mode: input.mode, serverUrl }

      if (changedConnectionTarget && this.activeUser) {
        await deleteSyncDeviceToken(this.activeUser.id)
      }

      this.settings.sync = sync
      await this.persist()
    },
    async startOfficialSyncAuthorization(): Promise<OfficialSyncAuthorization> {
      const user = this.activeUser
      if (!user?.crypto) throw new Error('syncLocked')
      this.requireVaultKey()

      const mode = this.settings.sync.mode
      const apiUrl = syncServerUrlForSettings(this.settings.sync)
      const loginBaseUrl = mode === 'official' ? configuredOfficialServerUrl() : webUrlForApiUrl(apiUrl)
      const loginUrl = new URL('/login', loginBaseUrl)
      loginUrl.searchParams.set('desktopBind', '1')
      loginUrl.searchParams.set('mode', mode)
      loginUrl.searchParams.set('serverUrl', apiUrl)
      loginUrl.searchParams.set('deviceName', deviceDisplayName())
      loginUrl.searchParams.set('clientDeviceId', this.settings.deviceId)
      return { loginUrl: loginUrl.toString() }
    },
    startServerAccountAuthorization(input: SyncConnectPayload): OfficialSyncAuthorization {
      const mode = input.mode
      const apiUrl = mode === 'official'
        ? configuredOfficialApiUrl()
        : requireSelfHostServerUrl(input.serverUrl)
      const loginBaseUrl = mode === 'official' ? configuredOfficialServerUrl() : webUrlForApiUrl(apiUrl)
      const loginUrl = new URL('/login', loginBaseUrl)
      loginUrl.searchParams.set('desktopBind', '1')
      loginUrl.searchParams.set('mode', mode)
      loginUrl.searchParams.set('serverUrl', apiUrl)
      loginUrl.searchParams.set('deviceName', deviceDisplayName())
      loginUrl.searchParams.set('clientDeviceId', this.settings.deviceId)
      return { loginUrl: loginUrl.toString() }
    },
    parseServerAccountAuthorizationCallback(callbackUrl: string): PendingSyncDeviceBindExchange {
      return parseSyncDeviceBindCallback(callbackUrl)
    },
    async completeOfficialSyncAuthorization(callbackOrCode: string): Promise<void> {
      const user = this.activeUser
      if (!user?.crypto) throw new Error('syncLocked')
      this.requireVaultKey()

      const exchange = parseSyncDeviceBindCallback(callbackOrCode)
      await this.applySyncExchange(exchange.mode, exchange.serverUrl, exchange)
    },
    async applyPendingServerAccountExchange(exchange: PendingSyncDeviceBindExchange): Promise<void> {
      await this.applySyncExchange(exchange.mode, exchange.serverUrl, exchange)
    },
    async applySyncExchange(mode: SyncMode, serverUrl: string, exchange: SyncDeviceBindResponse): Promise<void> {
      const user = this.activeUser
      if (!user?.crypto) throw new Error('syncLocked')

      await saveSyncDeviceToken(user.id, exchange.deviceToken)
      const client = new SyncApiClient(serverUrl)
      const syncSpace = await ensureSyncSpace(client, exchange.deviceToken, user.displayName || user.username)
      await this.ensureAllVaultObjectsLoaded()
      resetLoadedObjectsForNewSyncTarget(this.vaults, this.items, this.attachments, this.settings.deviceId)
      const now = new Date().toISOString()
      this.settings.sync = {
        mode,
        serverUrl,
        syncSpaceId: syncSpace.id,
        accountId: exchange.account.id,
        accountLabel: exchange.account.email ?? exchange.account.displayName,
        deviceId: exchange.device.id,
        cursor: 0,
        connectedAt: now,
        lastSyncAt: null
      }
      this.clearOfficialLoginState()
      await this.persist()
      await logInfo('sync target bound', {
        mode,
        serverUrl,
        syncSpaceId: syncSpace.id,
        localObjects: this.vaults.length + this.items.length + this.attachments.length
      })
    },
    async disconnectSync(): Promise<void> {
      if (this.activeUser) {
        await deleteSyncDeviceToken(this.activeUser.id)
      }

      this.clearOfficialLoginState()
      this.settings.sync = {
        ...DEFAULT_SYNC_SETTINGS,
        mode: this.settings.sync.mode,
        serverUrl: this.settings.sync.serverUrl
      }
      await this.persist()
    },
    async runSync(): Promise<SyncRunResult> {
      try {
        return await this.runSyncWithCurrentConnection()
      } catch (error) {
        await logError('sync failed', {
          ...syncErrorLogMetadata(error),
          mode: this.settings.sync.mode,
          serverUrl: syncServerUrlForSettings(this.settings.sync)
        })
        if (isSyncConnectionInvalid(error)) {
          await this.markSyncConnectionInvalid()
          throw new Error('syncConnectionInvalid')
        }
        throw error
      }
    },
    async tryAutoSync(reason: string): Promise<SyncRunResult | null> {
      if (!this.unlocked || !this.syncConnected || this.autoSync.running || this.syncConflictCount > 0) {
        return null
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        this.autoSync.lastError = 'syncNetworkBlocked'
        return null
      }

      this.autoSync.running = true
      this.autoSync.lastAttemptAt = new Date().toISOString()
      try {
        const result = await this.runSync()
        this.autoSync.lastError = ''
        await logDebug('auto sync completed', {
          reason,
          pushed: result.pushed,
          pulled: result.pulled,
          conflicts: result.conflicts,
          rejected: result.rejected
        })
        return result
      } catch (error) {
        this.autoSync.lastError = syncErrorMessage(error)
        await logInfo('auto sync deferred', {
          reason,
          ...syncErrorLogMetadata(error)
        })
        return null
      } finally {
        this.autoSync.running = false
      }
    },
    async runSyncWithCurrentConnection(): Promise<SyncRunResult> {
      const user = this.activeUser
      const { vaultKey, keyId } = this.requireVaultKey()
      if (!user?.crypto) throw new Error('syncLocked')
      await logInfo('sync started', {
        mode: this.settings.sync.mode,
        connected: Boolean(this.settings.sync.deviceId),
        localChanges: this.syncLocalChangeCount,
        cursor: this.settings.sync.cursor
      })
      await this.ensureAllVaultObjectsLoaded()

      const deviceToken = await loadSyncDeviceToken(user.id)
      if (!deviceToken || !this.settings.sync.deviceId) {
        throw new Error('syncNotConnected')
      }

      const client = new SyncApiClient(syncServerUrlForSettings(this.settings.sync))
      const syncSpace = this.settings.sync.syncSpaceId
        ? { id: this.settings.sync.syncSpaceId }
        : await ensureSyncSpace(client, deviceToken, user.displayName || user.username)
      this.settings.sync.syncSpaceId = syncSpace.id

      if (shouldResetLocalObjectsForInitialSync(this)) {
        resetLoadedObjectsForNewSyncTarget(this.vaults, this.items, this.attachments, this.settings.deviceId)
        await this.persist()
        await logInfo('sync local objects reset for initial upload', {
          localObjects: this.vaults.length + this.items.length + this.attachments.length
        })
      }

      if (shouldRepairEmptyLocalSyncState(this)) {
        const repairResult = await restoreFromSyncSnapshot({
          store: this,
          client,
          deviceToken,
          syncSpaceId: syncSpace.id,
          vaultKey
        })
        await client.ackSync(deviceToken, repairResult.cursor)
        this.settings.sync.cursor = repairResult.cursor
        this.settings.sync.lastSyncAt = new Date().toISOString()
        await this.persist()
        await logInfo('sync restored local snapshot', {
          pulled: repairResult.pulled,
          cursor: repairResult.cursor
        })
        return {
          pushed: 0,
          pulled: repairResult.pulled,
          conflicts: 0,
          rejected: 0,
          rejectedCodes: [],
          cursor: repairResult.cursor,
          recoveredFromSnapshot: true
        }
      }

      const pushObjects = await buildSyncPushObjects({
        syncSpaceId: syncSpace.id,
        vaultKey,
        keyId,
        vaults: this.vaults,
        items: this.items,
        attachments: this.attachments
      })
      let pushed = 0
      let conflicts = 0
      let rejected = 0
      const rejectedCodes: string[] = []

      for (const batch of chunkArray(pushObjects, 100)) {
        if (batch.length === 0) continue
        const pushResult = await client.pushSync(deviceToken, batch)
        pushed += pushResult.accepted.length
        conflicts += pushResult.conflicts.length
        rejected += pushResult.rejected?.length ?? 0
        rejectedCodes.push(...(pushResult.rejected ?? []).map((item) => `${item.code}: ${item.message}`))
        applyAcceptedSyncObjects(this, pushResult.accepted)
        applyConflictedSyncObjects(this, pushResult.conflicts)
        removeAcceptedDeletedObjects(this, pushResult.accepted)
      }

      let pulled = 0
      let cursor = this.settings.sync.cursor
      let hasMore = true
      while (hasMore) {
        const pullResult = await client.pullSync(deviceToken, cursor, 200)
        let skippedOtherSpaces = 0
        for (const event of pullResult.events) {
          if (event.syncSpaceId !== syncSpace.id) {
            skippedOtherSpaces += 1
            continue
          }
          if (event.objectSnapshot.updatedByDeviceId === this.settings.sync.deviceId) {
            continue
          }
          try {
            await applyRemoteSyncObject(this, event.objectSnapshot, vaultKey)
          } catch (error) {
            await logError('sync remote object failed', {
              ...syncErrorLogMetadata(error),
              eventId: event.id,
              objectId: event.objectId,
              objectType: event.objectSnapshot.objectType,
              revision: event.objectSnapshot.revision,
              updatedByDeviceId: event.objectSnapshot.updatedByDeviceId
            })
            throw error
          }
          pulled += 1
        }
        if (skippedOtherSpaces > 0) {
          await logInfo('sync skipped events from other spaces', {
            skipped: skippedOtherSpaces,
            cursor,
            nextCursor: pullResult.nextCursor
          })
        }
        cursor = pullResult.nextCursor
        hasMore = Boolean(pullResult.hasMore)
      }

      await client.ackSync(deviceToken, cursor)
      this.settings.sync.cursor = cursor
      this.settings.sync.lastSyncAt = new Date().toISOString()
      await this.persist()

      await logInfo('sync completed', { pushed, pulled, conflicts, rejected, cursor })
      return { pushed, pulled, conflicts, rejected, rejectedCodes, cursor }
    },
    async markSyncConnectionInvalid(): Promise<void> {
      if (this.activeUser) {
        await deleteSyncDeviceToken(this.activeUser.id)
      }

      this.settings.sync = {
        ...DEFAULT_SYNC_SETTINGS,
        mode: this.settings.sync.mode,
        serverUrl: this.settings.sync.serverUrl
      }
      await this.persist()
      await logError('sync connection marked invalid')
    },
    async createUser(input: CreateUserPayload): Promise<CreateUserResult> {
      const now = new Date().toISOString()
      const username = normalizeUsername(input.username)
      const displayName = input.username.trim()
      const setupUser = this.activeUser && !this.activeUser.crypto ? this.activeUser : null
      if (this.users.some((user) => user.id !== setupUser?.id && user.username === username)) {
        throw new Error('duplicate-username')
      }

      if (!setupUser && this.unlocked) {
        await this.persist()
      }

      const userId = setupUser?.id ?? `user-${crypto.randomUUID()}`
      const legacyPayload = setupUser ? this.legacyPayloads[setupUser.id] : undefined
      const payload = ensurePayloadHasVault(
        {
          vaults: legacyPayload?.vaults ?? (setupUser ? this.vaults : []),
          items: legacyPayload?.items ?? (setupUser ? this.items : []),
          attachments: legacyPayload?.attachments ?? (setupUser ? this.attachments : [])
        },
        this.settings.deviceId,
        this.settings.locale
      )
      const created = await createUserCrypto(userId, input.password, payload, input.recoveryKey)
      const migrated = legacyPayload
        ? await migrateLegacyPayload(userId, payload, created.vaultKey, created.crypto.keyId)
        : { payload, cleanupRefs: [] }
      const user: DesktopUserProfile = setupUser
        ? {
            ...setupUser,
            username,
            displayName,
            updatedAt: now,
            sync: normalizeSyncSettings(input.sync ?? setupUser.sync ?? this.settings.sync),
            crypto: created.crypto
          }
        : {
            id: userId,
            username,
            displayName,
            createdAt: now,
            updatedAt: now,
            sync: normalizeSyncSettings(input.sync ?? DEFAULT_SYNC_SETTINGS),
            crypto: created.crypto
          }

      this.users = setupUser
        ? this.users.map((candidate) => (candidate.id === user.id ? user : candidate))
        : [...this.users, user]
      this.activeUserId = user.id
      this.settings.sync = syncSettingsForUser(user)
      this.unlocked = true
      this.vaultKey = created.vaultKey
      this.activeKeyId = created.crypto.keyId
      this.loadActiveUserData(migrated.payload)
      await this.rememberSessionUnlock(user.id, created.crypto.keyId, input.password, created.vaultKey)
      delete this.legacyPayloads[user.id]
      let recoveryKeyStorage: RecoveryKeyStorageStatus = 'failed'
      try {
        recoveryKeyStorage = await saveAndVerifyRecoveryKey(user.id, created.recoveryKey)
        if (recoveryKeyStorage === 'failed') {
          this.storageError = 'recovery-key-save-verification-failed'
        }
      } catch (error) {
        this.storageError = error instanceof Error ? error.message : String(error)
      }
      await this.persist()
      if (!this.storageError) {
        await cleanupLegacyAttachmentRefs(migrated.cleanupRefs)
      }
      await logInfo('local user created', {
        hasLegacyPayload: Boolean(legacyPayload),
        recoveryKeyStorage,
        passwordlessUnlockSupported: this.passwordlessUnlockSupported
      })
      return { user, recoveryKey: created.recoveryKey, recoveryKeyStorage }
    },
    async loadSavedRecoveryKeyForActiveUser(): Promise<SecureRecoveryKeyResult> {
      const user = this.activeUser
      if (!user?.crypto) return { status: 'missing' }
      return loadRecoveryKey(user.id)
    },
    async revealRecoveryKey(password: string): Promise<SecureRecoveryKeyResult> {
      const user = this.activeUser
      if (!this.unlocked || !user?.crypto) return { status: 'missing' }

      const savedRecoveryKey = await loadRecoveryKey(user.id)
      if (savedRecoveryKey.status !== 'loaded') return savedRecoveryKey

      await unlockUserCrypto(user.id, password, savedRecoveryKey.recoveryKey, user.crypto)
      return savedRecoveryKey
    },
    async saveRecoveryKeyForActiveUser(password: string, recoveryKey: string): Promise<RecoveryKeyStorageStatus> {
      const user = this.activeUser
      if (!this.unlocked || !user?.crypto) return 'failed'

      await unlockUserCrypto(user.id, password, recoveryKey, user.crypto)

      return this.saveVerifiedRecoveryKeyForActiveUser(recoveryKey)
    },
    async saveVerifiedRecoveryKeyForActiveUser(recoveryKey: string): Promise<RecoveryKeyStorageStatus> {
      const user = this.activeUser
      if (!this.unlocked || !user?.crypto) return 'failed'

      try {
        const storageStatus = await saveAndVerifyRecoveryKey(user.id, recoveryKey)
        if (storageStatus === 'failed') {
          this.storageError = 'recovery-key-save-verification-failed'
        }
        return storageStatus
      } catch (error) {
        this.storageError = error instanceof Error ? error.message : String(error)
        return 'failed'
      }
    },
    async unlockActiveUser(password: string, recoveryKey: string): Promise<boolean> {
      const user = this.activeUser
      if (!user?.crypto) return false
      const keyId = user.crypto.keyId
      const perf = createPerfTrace('unlockActiveUser')

      try {
        const unlocked = await unlockUserCrypto(user.id, password, recoveryKey, user.crypto, perf)
        perf.mark('store.cryptoReady')
        this.unlocked = true
        this.vaultKey = unlocked.vaultKey
        this.activeKeyId = keyId
        await perf.measure('storage.loadInitialVaultObjects', () =>
          this.loadInitialUnlockedUserData(user.id, unlocked.vaultKey, keyId)
        )
        await this.rememberSessionUnlock(user.id, keyId, password, unlocked.vaultKey)
        perf.mark('store.sessionStateLoaded')
        await this.persist()
        perf.done({
          vaults: this.vaults.length,
          items: this.items.length,
          attachments: this.attachments.length
        })
        return true
      } catch (error) {
        perf.done({
          failed: true,
          error: error instanceof Error ? error.message : String(error)
        })
        this.unlocked = false
        this.clearSessionData()
        return false
      }
    },
    async unlockActiveUserWithSessionCache(password: string): Promise<SessionUnlockResult> {
      const user = this.activeUser
      const cache = this.sessionUnlockCache
      if (!user?.crypto || !cache || cache.userId !== user.id || cache.keyId !== user.crypto.keyId) {
        return 'unavailable'
      }
      const keyId = user.crypto.keyId

      const validPassword = await verifySessionUnlockCache(cache, password)
      if (!validPassword) return 'invalid'

      try {
        const vaultKey = copyBytes(cache.vaultKey)
        this.unlocked = true
        this.vaultKey = vaultKey
        this.activeKeyId = keyId
        await this.loadInitialUnlockedUserData(user.id, vaultKey, keyId)
        this.sessionUnlockCache = {
          ...cache,
          vaultKey: copyBytes(cache.vaultKey),
          lastUsedAt: new Date().toISOString()
        }
        return 'unlocked'
      } catch {
        this.clearSessionUnlockCache(user.id)
        this.unlocked = false
        this.clearSessionData()
        return 'unavailable'
      }
    },
    async rememberSessionUnlock(userId: string, keyId: string, password: string, vaultKey: Uint8Array): Promise<void> {
      const now = new Date().toISOString()
      const verifierSalt = randomHex(16)
      this.sessionUnlockCache = {
        userId,
        keyId,
        vaultKey: copyBytes(vaultKey),
        verifierSalt,
        verifierHash: await sessionPasswordVerifier(password, verifierSalt, userId, keyId),
        createdAt: now,
        lastUsedAt: now
      }
    },
    clearSessionUnlockCache(userId?: string): void {
      if (!userId || this.sessionUnlockCache?.userId === userId) {
        this.sessionUnlockCache = null
      }
    },
    async fastUnlockActiveUser(): Promise<boolean> {
      const user = this.activeUser
      const fastUnlock = user?.crypto?.fastUnlock
      if (!this.passwordlessUnlockSupported || !user?.crypto || !fastUnlock) return false
      const keyId = user.crypto.keyId
      const perf = createPerfTrace('fastUnlockActiveUser')

      try {
        const loadedDeviceUnlockKey = await perf.measure('secureStorage.loadDeviceUnlockKey', () =>
          loadDeviceUnlockKey(fastUnlock.accountId, user.id, fastUnlock.deviceId, fastUnlock.deviceKeyId)
        )
        if (loadedDeviceUnlockKey.status !== 'loaded') {
          await this.clearTrustedDeviceFastUnlock(user.id)
          await this.persist()
          perf.done({ status: loadedDeviceUnlockKey.status })
          return false
        }

        const unlocked = await unlockUserCryptoWithDeviceUnlockKey(
          user.id,
          this.settings.deviceId,
          loadedDeviceUnlockKey.deviceUnlockKey,
          user.crypto,
          perf
        )
        perf.mark('store.cryptoReady')
        this.unlocked = true
        this.vaultKey = unlocked.vaultKey
        this.activeKeyId = keyId
        await perf.measure('storage.loadInitialVaultObjects', () =>
          this.loadInitialUnlockedUserData(user.id, unlocked.vaultKey, keyId)
        )
        this.touchTrustedDeviceFastUnlock(user.id)
        perf.mark('store.sessionStateLoaded')
        perf.done({
          vaults: this.vaults.length,
          items: this.items.length,
          attachments: this.attachments.length
        })
        return true
      } catch (error) {
        await this.clearTrustedDeviceFastUnlock(user.id)
        await this.persist()
        perf.done({
          failed: true,
          error: error instanceof Error ? error.message : String(error)
        })
        this.unlocked = false
        this.clearSessionData()
        return false
      }
    },
    async setupTrustedDeviceFastUnlock(userId: string, vaultKey: Uint8Array): Promise<boolean> {
      if (!this.passwordlessUnlockSupported) {
        const user = this.users.find((candidate) => candidate.id === userId)
        if (user?.crypto?.fastUnlock) await this.clearTrustedDeviceFastUnlock(userId)
        return false
      }
      const user = this.users.find((candidate) => candidate.id === userId)
      if (!user?.crypto) return false
      const previousFastUnlock = user.crypto.fastUnlock ?? null

      const vaultId = this.vaults[0]?.id ?? 'local-vault'
      try {
        const created = await createDeviceFastUnlock({
          accountId: user.id,
          userId: user.id,
          deviceId: this.settings.deviceId,
          vaultId,
          keyId: user.crypto.keyId,
          vaultKey
        })
        const saved = await saveDeviceUnlockKey(
          created.fastUnlock.accountId,
          user.id,
          this.settings.deviceId,
          created.fastUnlock.deviceKeyId,
          created.deviceUnlockKey
        )
        if (saved.status !== 'saved') return false
        if (previousFastUnlock && previousFastUnlock.deviceKeyId !== created.fastUnlock.deviceKeyId) {
          await deleteDeviceUnlockKey(
            previousFastUnlock.accountId,
            previousFastUnlock.userId,
            previousFastUnlock.deviceId,
            previousFastUnlock.deviceKeyId
          ).catch(() => ({ status: 'unsupported' as const }))
        }

        this.users = this.users.map((candidate) =>
          candidate.id === user.id && candidate.crypto
            ? {
                ...candidate,
                crypto: {
                  ...candidate.crypto,
                  fastUnlock: created.fastUnlock
                },
                updatedAt: created.fastUnlock.updatedAt
              }
            : candidate
        )
        return true
      } catch (error) {
        return false
      }
    },
    async clearTrustedDeviceFastUnlock(userId: string): Promise<void> {
      const user = this.users.find((candidate) => candidate.id === userId)
      const fastUnlock = user?.crypto?.fastUnlock
      if (fastUnlock) {
        await deleteDeviceUnlockKey(fastUnlock.accountId, userId, fastUnlock.deviceId, fastUnlock.deviceKeyId).catch(() => ({ status: 'unsupported' as const }))
      }
      this.users = this.users.map((candidate) =>
        candidate.id === userId && candidate.crypto
          ? {
              ...candidate,
              crypto: {
                ...candidate.crypto,
                fastUnlock: null
              }
            }
          : candidate
      )
    },
    touchTrustedDeviceFastUnlock(userId: string): void {
      const now = new Date().toISOString()
      this.users = this.users.map((candidate) =>
        candidate.id === userId && candidate.crypto?.fastUnlock
          ? {
              ...candidate,
              crypto: {
                ...candidate.crypto,
                fastUnlock: {
                  ...candidate.crypto.fastUnlock,
                  updatedAt: now
                }
              },
              updatedAt: now
            }
          : candidate
      )
    },
    lock() {
      this.unlocked = false
      this.vaultKey = null
      this.activeKeyId = null
      this.clearSessionData()
    },
    async switchUser(userId: string) {
      if (userId === this.activeUserId) return
      if (!this.users.some((user) => user.id === userId)) return

      if (this.unlocked) await this.persist()
      this.activeUserId = userId
      this.unlocked = false
      this.vaultKey = null
      this.activeKeyId = null
      this.query = ''
      this.clearSessionUnlockCache()
      this.settings.sync = syncSettingsForUser(this.users.find((user) => user.id === userId) ?? null)
      this.selectedVaultId = 'all'
      this.selectedType = 'all'
      this.clearSessionData()
      await this.persist()
    },
    async removeActiveUserFromDevice(): Promise<DesktopUserProfile | null> {
      const user = this.activeUser
      if (!user) return null

      const removedAttachmentRefs = this.unlocked && this.activeUserId === user.id
        ? this.attachments.map((attachment) => ({
            ref: attachment.encryptedBlobRef,
            attachmentId: attachment.id
          }))
        : []
      const remainingUsers = this.users.filter((candidate) => candidate.id !== user.id)
      const nextUser = remainingUsers[0] ?? null

      await cleanupLocalSecretsForUser(user, this.storageBackend)
      await cleanupLocalAttachmentRefs(removedAttachmentRefs)

      this.users = remainingUsers
      this.activeUserId = nextUser?.id ?? null
      this.unlocked = false
      this.vaultKey = null
      this.activeKeyId = null
      this.clearSessionUnlockCache(user.id)
      this.query = ''
      this.selectedVaultId = 'all'
      this.selectedType = 'all'
      this.settings.sync = syncSettingsForUser(nextUser)
      this.clearOfficialLoginState()
      this.clearSessionData()
      await this.persist()
      await logInfo('local user removed from device', {
        remainingUsers: this.users.length,
        removedAttachments: removedAttachmentRefs.length
      })
      return user
    },
    setOfficialLoginInProgress(inProgress: boolean): void {
      this.officialLogin.inProgress = inProgress
      if (inProgress) {
        this.officialLogin.lastError = ''
      } else {
        this.officialLogin.exchangeCode = null
      }
    },
    setOfficialLoginError(error: string): void {
      this.officialLogin.inProgress = false
      this.officialLogin.exchangeCode = null
      this.officialLogin.lastError = error
    },
    clearOfficialLoginState(): void {
      this.officialLogin = {
        inProgress: false,
        exchangeCode: null,
        lastError: ''
      }
    },
    async loadInitialUnlockedUserData(userId: string, vaultKey: Uint8Array, keyId: string): Promise<void> {
      const [vaults, counts] = await Promise.all([
        loadVaultMetadataFromLocalObjects(userId, vaultKey, keyId),
        countEncryptedObjectsByVault(userId, 'vault_item')
      ])
      this.vaults = vaults
      this.items = []
      this.attachments = []
      this.loadedVaultIds = []
      this.vaultItemCounts = Object.fromEntries(counts.map((entry) => [entry.vaultId, entry.count]))

      const firstVaultId = this.vaults.find((vault) => !vault.sync.deletedAt)?.id ?? 'all'
      this.selectedVaultId = this.selectedVaultId === 'all' || !this.vaults.some((vault) => vault.id === this.selectedVaultId)
        ? firstVaultId
        : this.selectedVaultId
      await this.ensureSelectedVaultObjectsLoaded()
      this.selectedItemId = this.items.find((item) => !item.sync.deletedAt)?.id ?? null
    },
    loadActiveUserData(payload: DesktopVaultPayload) {
      this.vaults = payload.vaults ?? []
      this.items = payload.items ?? []
      this.attachments = payload.attachments ?? []
      this.loadedVaultIds = this.vaults.map((vault) => vault.id)
      this.vaultItemCounts = countItemsByVault(this.items)
      this.selectedItemId = this.items[0]?.id ?? null
    },
    clearSessionData() {
      this.vaults = []
      this.items = []
      this.attachments = []
      this.loadedVaultIds = []
      this.vaultItemCounts = {}
      this.selectedItemId = null
      clearAttachmentBlobCache()
    },
    requireVaultKey(): { vaultKey: Uint8Array; keyId: string } {
      if (!this.unlocked || !this.vaultKey || !this.activeKeyId) {
        throw new Error('syncLocked')
      }
      return { vaultKey: this.vaultKey, keyId: this.activeKeyId }
    },
    selectItem(itemId: string) {
      this.selectedItemId = itemId
    },
    async selectVault(vaultId: string | 'all') {
      this.selectedVaultId = vaultId
      await this.ensureSelectedVaultObjectsLoaded()
      if (!this.items.some((item) => !item.sync.deletedAt && item.id === this.selectedItemId)) {
        this.selectedItemId = this.items.find((item) => !item.sync.deletedAt)?.id ?? null
      }
    },
    async ensureSelectedVaultObjectsLoaded(): Promise<void> {
      if (!this.unlocked) return
      if (this.selectedVaultId === 'all') {
        await this.ensureAllVaultObjectsLoaded()
        return
      }
      await this.ensureVaultObjectsLoaded(this.selectedVaultId)
    },
    async ensureVaultObjectsLoaded(vaultId: string): Promise<void> {
      const { vaultKey, keyId } = this.requireVaultKey()
      const userId = this.activeUserId
      if (!userId || this.loadedVaultIds.includes(vaultId)) return
      const payload = await loadVaultScopedPayloadFromLocalObjects(userId, vaultId, vaultKey, keyId)
      this.items = mergeById(this.items, payload.items)
      this.attachments = mergeById(this.attachments, payload.attachments)
      this.loadedVaultIds = [...new Set([...this.loadedVaultIds, vaultId])]
    },
    async ensureAllVaultObjectsLoaded(): Promise<void> {
      const { vaultKey, keyId } = this.requireVaultKey()
      const userId = this.activeUserId
      if (!userId) return
      const missingVaultIds = this.vaults
        .filter((vault) => !vault.sync.deletedAt && !this.loadedVaultIds.includes(vault.id))
        .map((vault) => vault.id)
      for (const vaultId of missingVaultIds) {
        const payload = await loadVaultScopedPayloadFromLocalObjects(userId, vaultId, vaultKey, keyId)
        this.items = mergeById(this.items, payload.items)
        this.attachments = mergeById(this.attachments, payload.attachments)
      }
      this.loadedVaultIds = [...new Set([...this.loadedVaultIds, ...missingVaultIds])]
    },
    async createVault(input: CreateVaultPayload): Promise<Vault> {
      this.requireVaultKey()
      const now = new Date().toISOString()
      const vault: Vault = {
        id: `vault-${crypto.randomUUID()}`,
        schemaVersion: CORE_SCHEMA_VERSION,
        name: input.name.trim() || desktopMessages[this.settings.locale].vault.fallbackName,
        description: input.description.trim(),
        color: input.color,
        icon: input.icon,
        createdAt: now,
        updatedAt: now,
        sync: createSync(this.settings.deviceId)
      }

      this.vaults = [...this.vaults, vault]
      this.loadedVaultIds = [...new Set([...this.loadedVaultIds, vault.id])]
      this.vaultItemCounts = {
        ...this.vaultItemCounts,
        [vault.id]: this.vaultItemCounts[vault.id] ?? 0
      }
      this.selectedVaultId = vault.id
      await this.persist()
      void this.tryAutoSync('create-vault')
      return vault
    },
    async deleteVault(vaultId: string): Promise<{ vaultName: string; itemCount: number }> {
      this.requireVaultKey()
      await this.ensureVaultObjectsLoaded(vaultId)
      const vault = this.vaults.find((candidate) => candidate.id === vaultId && !candidate.sync.deletedAt)
      if (!vault) throw new Error('vault-not-found')
      if (this.vaults.filter((candidate) => !candidate.sync.deletedAt).length <= 1) {
        throw new Error('vault-delete-last')
      }

      const now = new Date().toISOString()
      const itemIds = new Set(
        this.items
          .filter((item) => item.vaultId === vaultId && !item.sync.deletedAt)
          .map((item) => item.id)
      )
      const itemCount = itemIds.size

      this.vaults = this.vaults.map((candidate) =>
        candidate.id === vaultId
          ? markDeletedObject(candidate, now, this.settings.deviceId)
          : candidate
      )
      this.items = this.items.map((item) =>
        itemIds.has(item.id)
          ? markDeletedObject(item, now, this.settings.deviceId)
          : item
      )
      this.attachments = this.attachments.map((attachment) =>
        attachment.vaultId === vaultId || itemIds.has(attachment.itemId)
          ? markDeletedObject(attachment, now, this.settings.deviceId)
          : attachment
      )

      if (this.selectedVaultId === vaultId) {
        this.selectedVaultId = 'all'
      }
      if (this.selectedItemId && itemIds.has(this.selectedItemId)) {
        this.selectedItemId = this.items.find((item) => !item.sync.deletedAt && !itemIds.has(item.id))?.id ?? null
      }
      this.vaultItemCounts = countItemsByVault(this.items)

      await this.persist()
      void this.tryAutoSync('delete-vault')
      return { vaultName: vault.name, itemCount }
    },
    async saveItem(input: SaveItemPayload): Promise<VaultItem> {
      this.requireVaultKey()
      const now = new Date().toISOString()
      const existing = input.editingItemId
        ? this.items.find((item) => item.id === input.editingItemId) ?? null
        : null
      const itemId = existing?.id ?? `item-${crypto.randomUUID()}`
      const urlFields = input.fields.filter((field) => field.kind === 'url').map((field) => field.value)
      const visibleFields = input.fields.filter((field) => field.kind !== 'url')
      const nextRevision = (existing?.sync.revision ?? 0) + 1
      const attachmentIds = input.attachments.map((attachment) => attachment.id)

      const item: VaultItem = {
        id: itemId,
        vaultId: input.vaultId,
        schemaVersion: CORE_SCHEMA_VERSION,
        type: input.type,
        title: input.title.trim() || desktopMessages[this.settings.locale].itemDefaults.untitled,
        subtitle: buildSubtitle(input.type, input.fields, input.attachments, input.notes, this.settings.locale),
        notes: input.notes.trim(),
        urls: urlFields,
        tags: [],
        favorite: existing?.favorite ?? false,
        archived: existing?.archived ?? false,
        fields: visibleFields,
        attachmentIds,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        sync: {
          revision: nextRevision,
          baseRevision: existing?.sync.revision ?? 0,
          updatedByDeviceId: this.settings.deviceId,
          deletedAt: null,
          state: 'dirty'
        }
      }

      const nextAttachments: VaultAttachment[] = input.attachments.map((attachment) => {
        const existingAttachment = this.attachments.find((candidate) => candidate.id === attachment.id)

        return {
          id: attachment.id,
          vaultId: input.vaultId,
          itemId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          checksumSha256: attachment.checksumSha256,
          encryptedBlobRef: attachment.encryptedBlobRef,
          state: attachment.state,
          createdAt: existingAttachment?.createdAt ?? now,
          updatedAt: now,
          sync: {
            revision: (existingAttachment?.sync.revision ?? 0) + 1,
            baseRevision: existingAttachment?.sync.revision ?? 0,
            updatedByDeviceId: this.settings.deviceId,
            deletedAt: null,
            state: 'dirty'
          }
        }
      })

      this.items = existing ? this.items.map((candidate) => (candidate.id === existing.id ? item : candidate)) : [item, ...this.items]
      this.attachments = [...this.attachments.filter((attachment) => attachment.itemId !== itemId), ...nextAttachments]
      this.loadedVaultIds = [...new Set([...this.loadedVaultIds, input.vaultId])]
      this.vaultItemCounts = {
        ...this.vaultItemCounts,
        [input.vaultId]: this.items.filter((candidate) => candidate.vaultId === input.vaultId && !candidate.sync.deletedAt).length
      }
      this.selectedItemId = item.id
      await this.persist()
      void this.tryAutoSync(existing ? 'update-item' : 'create-item')
      return item
    },
    async exportBackupPackage(): Promise<LockPassBackupPackageV1> {
      const user = this.activeUser
      if (!user?.crypto || !this.activeUserId) throw new Error('syncLocked')
      const { vaultKey, keyId } = this.requireVaultKey()
      await this.ensureAllVaultObjectsLoaded()
      await logInfo('backup export started', {
        vaults: this.vaults.length,
        items: this.items.length,
        attachments: this.attachments.length
      })
      const records = await buildLocalEncryptedObjectRecords({
        vaultKey,
        keyId,
        vaults: this.vaults,
        items: this.items,
        attachments: this.attachments
      })
      const attachments = []
      for (const attachment of this.attachments) {
        if (!attachment.encryptedBlobRef || attachment.state === 'missing') continue
        const bytes = await loadAttachmentBlobBytes(attachment.id, attachment.encryptedBlobRef)
        attachments.push({
          attachmentId: attachment.id,
          fileName: `${attachment.id}.lpblob`,
          encryptedBlobRef: attachment.encryptedBlobRef,
          bytesBase64: bytesToBase64(bytes)
        })
      }

      return {
        format: 'lockpass-next-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        user: backupUserProfile(user),
        encryptedObjects: records,
        attachments
      }
    },
    async restoreBackupPackage(backup: LockPassBackupPackageV1): Promise<void> {
      const user = backupUserProfile(backup.user)
      if (!user.crypto) throw new Error('invalid-backup-file')
      await logInfo('backup restore started', {
        encryptedObjects: backup.encryptedObjects.length,
        attachments: backup.attachments.length
      })

      for (const attachment of backup.attachments) {
        await saveEncryptedAttachmentBlob(
          user.id,
          attachment.attachmentId,
          attachment.fileName || `${attachment.attachmentId}.lpblob`,
          base64ToBytes(attachment.bytesBase64)
        )
      }

      await saveEncryptedObjects(user.id, backup.encryptedObjects)
      const remainingUsers = this.users.filter((candidate) => candidate.id !== user.id)
      this.users = [user, ...remainingUsers]
      this.activeUserId = user.id
      this.unlocked = false
      this.vaultKey = null
      this.activeKeyId = null
      this.clearSessionUnlockCache(user.id)
      this.query = ''
      this.selectedVaultId = 'all'
      this.selectedType = 'all'
      this.settings.sync = syncSettingsForUser(user)
      this.clearOfficialLoginState()
      this.clearSessionData()
      await saveVaultStore({
        schemaVersion: DESKTOP_STORE_SCHEMA_VERSION,
        activeUserId: this.activeUserId,
        users: this.users,
        settings: this.settings
      })
      await logInfo('backup restore completed', {
        users: this.users.length,
        encryptedObjects: backup.encryptedObjects.length,
        attachments: backup.attachments.length
      })
    },
    async exportCsvText(): Promise<string> {
      this.requireVaultKey()
      await this.ensureAllVaultObjectsLoaded()
      await logInfo('csv export started', { items: this.items.length })
      return exportItemsToCsv(
        this.items.map((item) => ({
          type: item.type,
          title: item.title,
          notes: item.notes,
          urls: item.urls,
          fields: item.fields.map((field) => ({ ...field }))
        }))
      )
    },
    async importExternalItems(items: ExternalImportItem[], vaultName: string): Promise<ImportItemsResult> {
      this.requireVaultKey()
      const cleanItems = items.filter((item) => item.title.trim() || item.fields.some((field) => field.value.trim()) || item.notes.trim())
      if (cleanItems.length === 0) {
        return { imported: 0, skipped: items.length, vaultName }
      }

      const now = new Date().toISOString()
      const vault = buildImportedVault(vaultName, now, this.settings.deviceId, this.settings.locale)
      const importedItems = buildImportedItems(cleanItems, vault.id, now, this.settings.deviceId, this.settings.locale)

      this.vaults = [vault, ...this.vaults]
      this.items = [...importedItems, ...this.items]
      this.loadedVaultIds = [...new Set([...this.loadedVaultIds, vault.id])]
      this.vaultItemCounts = countItemsByVault(this.items)
      this.selectedVaultId = vault.id
      this.selectedItemId = importedItems[0]?.id ?? this.selectedItemId
      await this.persist()
      void this.tryAutoSync('import-items')
      await logInfo('external items imported', {
        imported: importedItems.length,
        skipped: items.length - importedItems.length
      })
      return {
        imported: importedItems.length,
        skipped: items.length - importedItems.length,
        vaultName: vault.name
      }
    },
    async importExternalVaults(vaults: ExternalImportVault[], fallbackVaultName: string): Promise<ImportVaultsResult> {
      this.requireVaultKey()
      if (vaults.length === 0) {
        return { imported: 0, skipped: 0, vaults: 0 }
      }

      const now = new Date().toISOString()
      const importedVaults: Vault[] = []
      const importedItems: VaultItem[] = []
      let skipped = 0

      for (const sourceVault of vaults) {
        const cleanItems = sourceVault.items.filter((item) =>
          item.title.trim() || item.fields.some((field) => field.value.trim()) || item.notes.trim()
        )
        const vault = buildImportedVault(sourceVault.name || fallbackVaultName, now, this.settings.deviceId, this.settings.locale)
        importedVaults.push(vault)
        importedItems.push(...buildImportedItems(cleanItems, vault.id, now, this.settings.deviceId, this.settings.locale))
        skipped += sourceVault.items.length - cleanItems.length
      }

      this.vaults = [...importedVaults, ...this.vaults]
      this.items = [...importedItems, ...this.items]
      this.loadedVaultIds = [...new Set([...this.loadedVaultIds, ...importedVaults.map((vault) => vault.id)])]
      this.vaultItemCounts = countItemsByVault(this.items)
      this.selectedVaultId = importedVaults[0]?.id ?? this.selectedVaultId
      this.selectedItemId = importedItems[0]?.id ?? this.selectedItemId
      await this.persist()
      void this.tryAutoSync('import-vaults')
      await logInfo('external vaults imported', {
        imported: importedItems.length,
        skipped,
        vaults: importedVaults.length
      })
      return {
        imported: importedItems.length,
        skipped,
        vaults: importedVaults.length
      }
    }
  }
})

async function saveAndVerifyRecoveryKey(userId: string, recoveryKey: string): Promise<RecoveryKeyStorageStatus> {
  const savedRecoveryKey = await saveRecoveryKey(userId, recoveryKey)
  if (savedRecoveryKey.status !== 'saved') return 'unsupported'

  const loadedRecoveryKey = await loadRecoveryKey(userId)
  return loadedRecoveryKey.status === 'loaded' && loadedRecoveryKey.recoveryKey === recoveryKey ? 'saved' : 'failed'
}

async function ensureSyncSpace(client: SyncApiClient, deviceToken: string, _displayName: string): Promise<{ id: string }> {
  const normalizedDisplayName = 'default'
  const spaces = await client.syncSpaces(deviceToken)
  return spaces.syncSpaces.find((space) => space.displayName === normalizedDisplayName)
    ?? (await client.createSyncSpace(deviceToken, normalizedDisplayName)).syncSpace
}

function syncServerUrlForSettings(sync: DesktopSyncSettings): string {
  return sync.mode === 'official'
    ? configuredOfficialApiUrl()
    : requireSelfHostServerUrl(sync.serverUrl)
}

function webUrlForApiUrl(apiUrl: string): string {
  const normalized = requireSelfHostServerUrl(apiUrl)
  try {
    const url = new URL(normalized)
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      const port = Number(url.port)
      if (port === 1480) {
        url.port = '1431'
      }
    }
    return url.toString()
  } catch {
    return normalized
  }
}

function parseSyncDeviceBindCallback(value: string): SyncDeviceBindCallbackPayload {
  const parsed = new URL(value)
  if (parsed.protocol !== 'lockpass:' || parsed.hostname !== 'auth' || parsed.pathname !== '/callback') {
    throw new Error('syncOfficialCallbackMismatch')
  }

  const payloadText = parsed.searchParams.get('payload')
  if (!payloadText) throw new Error('syncOfficialAuthorizationMissing')

  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadText))) as SyncDeviceBindCallbackPayload
    if (
      (decoded.mode !== 'official' && decoded.mode !== 'selfhost') ||
      !decoded.serverUrl ||
      !decoded.deviceToken ||
      !decoded.account?.id ||
      !decoded.device?.id
    ) {
      throw new Error('syncOfficialCallbackMismatch')
    }
    return {
      ...decoded,
      serverUrl: decoded.mode === 'official'
        ? configuredOfficialApiUrl()
        : normalizeSyncServerUrl(decoded.serverUrl)
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'syncOfficialCallbackMismatch') throw error
    throw new Error('syncOfficialCallbackMismatch')
  }
}

function base64UrlDecode(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function deviceDisplayName(): string {
  if (navigator.userAgent.includes('Windows')) return 'LockPass Windows Desktop'
  if (navigator.userAgent.includes('Mac')) return 'LockPass macOS Desktop'
  if (navigator.userAgent.includes('Linux')) return 'LockPass Linux Desktop'
  return 'LockPass Desktop'
}

function isSyncConnectionInvalid(error: unknown): boolean {
  if (error instanceof SyncApiError) {
    return error.status === 401 || error.status === 403 || error.status === 404
  }

  const message = error instanceof Error ? error.message : String(error)
  return /unauthorized|forbidden|not found|device not found|sync space/i.test(message)
}

function syncErrorLogMetadata(error: unknown): Record<string, unknown> {
  if (error instanceof SyncApiError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status
    }
  }

  if (error instanceof Error) {
    const metadata: Record<string, unknown> = {
      name: error.name,
      message: error.message
    }
    const cause = (error as Error & { cause?: unknown }).cause
    if (cause instanceof Error) {
      metadata.causeName = cause.name
      metadata.causeMessage = cause.message
    } else if (cause) {
      metadata.cause = String(cause)
    }
    return metadata
  }

  return { message: String(error) }
}

function syncErrorMessage(error: unknown): string {
  return typeof error === 'string' ? error : error instanceof Error ? error.message : String(error)
}

interface SyncBuildInput {
  syncSpaceId: string
  vaultKey: Uint8Array
  keyId: string
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
}

type VaultObject = Vault | VaultItem | VaultAttachment

async function buildSyncPushObjects(input: SyncBuildInput): Promise<SyncPushObject[]> {
  const objects: SyncPushObject[] = []

  for (const vault of input.vaults.filter((candidate) => shouldPushSync(candidate.sync))) {
    const objectId = toServerUuid(vault.id)
    const revision = vault.sync.revision
    const payload = withCleanSync(vault, revision)
    objects.push(await makeSyncPushObject(input, vault.sync, 'vault_metadata', objectId, objectId, payload))
  }

  for (const item of input.items.filter((candidate) => shouldPushSync(candidate.sync))) {
    const objectId = toServerUuid(item.id)
    const vaultId = toServerUuid(item.vaultId)
    const revision = item.sync.revision
    const payload = withCleanSync(item, revision)
    objects.push(await makeSyncPushObject(input, item.sync, 'vault_item', objectId, vaultId, payload))
  }

  for (const attachment of input.attachments.filter((candidate) => shouldPushSync(candidate.sync))) {
    const objectId = toServerUuid(attachment.id)
    const vaultId = toServerUuid(attachment.vaultId)
    const revision = attachment.sync.revision
    const payload = withCleanSync(attachment, revision)
    objects.push(await makeSyncPushObject(input, attachment.sync, 'vault_attachment', objectId, vaultId, payload))
  }

  return objects
}

interface LocalObjectBuildInput {
  vaultKey: Uint8Array
  keyId: string
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
}

async function buildLocalEncryptedObjectRecords(input: LocalObjectBuildInput): Promise<EncryptedObjectRecord[]> {
  const records: EncryptedObjectRecord[] = []

  for (const vault of input.vaults) {
    records.push(await makeLocalEncryptedObjectRecord(input, vault.sync, 'vault_metadata', vault.id, vault.id, vault))
  }

  for (const item of input.items) {
    records.push(await makeLocalEncryptedObjectRecord(input, item.sync, 'vault_item', item.id, item.vaultId, item))
  }

  for (const attachment of input.attachments) {
    records.push(await makeLocalEncryptedObjectRecord(input, attachment.sync, 'vault_attachment', attachment.id, attachment.vaultId, attachment))
  }

  return records
}

async function makeLocalEncryptedObjectRecord(
  input: LocalObjectBuildInput,
  sync: SyncMetadata,
  objectType: SyncVaultObjectType,
  objectId: string,
  vaultId: string,
  payload: VaultObject
): Promise<EncryptedObjectRecord> {
  return {
    objectId,
    objectType,
    vaultId,
    revision: sync.revision,
    baseRevision: sync.baseRevision,
    syncState: sync.state,
    deletedAt: sync.deletedAt,
    updatedAt: payload.updatedAt,
    keyId: input.keyId,
    envelope: await encryptSyncObjectPayload(
      input.vaultKey,
      input.keyId,
      {
        objectType,
        objectId,
        vaultId,
        revision: sync.revision
      },
      payload
    )
  }
}

async function loadVaultMetadataFromLocalObjects(
  userId: string,
  vaultKey: Uint8Array,
  keyId: string
): Promise<Vault[]> {
  const records = await queryEncryptedObjects(userId, { objectType: 'vault_metadata' })
  const payload = await decryptLocalObjectRecords(records, vaultKey, keyId)
  return payload.vaults
}

async function loadVaultScopedPayloadFromLocalObjects(
  userId: string,
  vaultId: string,
  vaultKey: Uint8Array,
  keyId: string
): Promise<DesktopVaultPayload> {
  const records = await queryEncryptedObjects(userId, { vaultId })
  return decryptLocalObjectRecords(
    records.filter((record) => record.objectType !== 'vault_metadata'),
    vaultKey,
    keyId
  )
}

async function decryptLocalObjectRecords(
  records: EncryptedObjectRecord[],
  vaultKey: Uint8Array,
  keyId: string
): Promise<DesktopVaultPayload> {
  const payload: DesktopVaultPayload = {
    vaults: [],
    items: [],
    attachments: []
  }

  for (const record of records) {
    const metadata = {
      objectType: record.objectType,
      objectId: record.objectId,
      vaultId: record.vaultId,
      revision: record.revision
    }
    const decrypted = await decryptSyncObjectPayload<VaultObject>(vaultKey, record.keyId || keyId, metadata, record.envelope)
    const sync: SyncMetadata = {
      revision: record.revision,
      baseRevision: record.baseRevision,
      updatedByDeviceId: decrypted.sync.updatedByDeviceId,
      deletedAt: record.deletedAt,
      state: record.syncState
    }

    if (record.objectType === 'vault_metadata') {
      payload.vaults.push({ ...(decrypted as Vault), sync })
    } else if (record.objectType === 'vault_item') {
      payload.items.push({ ...(decrypted as VaultItem), sync })
    } else {
      payload.attachments.push({ ...(decrypted as VaultAttachment), sync })
    }
  }

  return payload
}

async function makeSyncPushObject(
  input: SyncBuildInput,
  sync: SyncMetadata,
  objectType: SyncVaultObjectType,
  objectId: string,
  vaultId: string,
  payload: unknown
): Promise<SyncPushObject> {
  return {
    clientOperationId: crypto.randomUUID(),
    syncSpaceId: input.syncSpaceId,
    objectId,
    vaultId,
    objectType,
    baseRevision: sync.baseRevision,
    revision: sync.revision,
    encryptedPayload: await encryptSyncObjectPayload(
      input.vaultKey,
      input.keyId,
      {
        objectType,
        objectId,
        vaultId,
        revision: sync.revision
      },
      payload
    ),
    deletedAt: sync.deletedAt
  }
}

interface SyncStateContainer {
  settings: {
    sync: DesktopSyncSettings
  }
  vaults: Vault[]
  items: VaultItem[]
  attachments: VaultAttachment[]
}

function applyAcceptedSyncObjects(store: SyncStateContainer, accepted: Array<{ objectId: string; revision: number }>): void {
  for (const result of accepted) {
    markLocalObjectSyncState(store, result.objectId, (sync) => ({
      ...sync,
      revision: result.revision,
      baseRevision: result.revision,
      state: 'clean'
    }))
  }
}

function applyConflictedSyncObjects(store: SyncStateContainer, conflicts: Array<{ objectId: string }>): void {
  for (const conflict of conflicts) {
    markLocalObjectSyncState(store, conflict.objectId, (sync) => ({
      ...sync,
      state: 'conflicted'
    }))
  }
}

function removeAcceptedDeletedObjects(store: SyncStateContainer, accepted: Array<{ objectId: string }>): void {
  const acceptedIds = new Set(accepted.map((result) => result.objectId))
  const deletedVaultIds = new Set(
    store.vaults
      .filter((vault) => vault.sync.deletedAt && serverIdsHasLocalId(acceptedIds, vault.id))
      .map((vault) => vault.id)
  )
  const deletedItemIds = new Set(
    store.items
      .filter((item) => (item.sync.deletedAt || deletedVaultIds.has(item.vaultId)) && serverIdsHasLocalId(acceptedIds, item.id))
      .map((item) => item.id)
  )

  store.vaults = store.vaults.filter((vault) => !(vault.sync.deletedAt && serverIdsHasLocalId(acceptedIds, vault.id)))
  store.items = store.items.filter((item) => !(item.sync.deletedAt && serverIdsHasLocalId(acceptedIds, item.id)) && !deletedVaultIds.has(item.vaultId))
  store.attachments = store.attachments.filter((attachment) =>
    !(attachment.sync.deletedAt && serverIdsHasLocalId(acceptedIds, attachment.id)) &&
    !deletedVaultIds.has(attachment.vaultId) &&
    !deletedItemIds.has(attachment.itemId)
  )
}

function markLocalObjectSyncState(
  store: SyncStateContainer,
  serverObjectId: string,
  update: (sync: SyncMetadata) => SyncMetadata
): void {
  store.vaults = store.vaults.map((vault) =>
    safeToServerUuid(vault.id) === serverObjectId ? { ...vault, sync: update(vault.sync) } : vault
  )
  store.items = store.items.map((item) =>
    safeToServerUuid(item.id) === serverObjectId ? { ...item, sync: update(item.sync) } : item
  )
  store.attachments = store.attachments.map((attachment) =>
    safeToServerUuid(attachment.id) === serverObjectId ? { ...attachment, sync: update(attachment.sync) } : attachment
  )
}

function resetLoadedObjectsForNewSyncTarget(
  vaults: Vault[],
  items: VaultItem[],
  attachments: VaultAttachment[],
  deviceId: string
): void {
  for (const vault of vaults) {
    vault.sync = resetSyncForNewTarget(vault.sync, deviceId)
  }
  for (const item of items) {
    item.sync = resetSyncForNewTarget(item.sync, deviceId)
  }
  for (const attachment of attachments) {
    attachment.sync = resetSyncForNewTarget(attachment.sync, deviceId)
  }
}

function resetSyncForNewTarget(sync: SyncMetadata, deviceId: string): SyncMetadata {
  return {
    ...sync,
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: deviceId,
    state: 'dirty'
  }
}

async function applyRemoteSyncObject(
  store: SyncStateContainer,
  object: SyncObjectView,
  vaultKey: Uint8Array
): Promise<void> {
  if (object.deletedAt) {
    removeRemoteObject(store, object)
    return
  }

  const metadata = {
    objectType: object.objectType,
    objectId: object.objectId,
    vaultId: object.vaultId,
    revision: object.revision
  }
  const payload = await decryptSyncObjectPayload<Vault | VaultItem | VaultAttachment>(
    vaultKey,
    object.encryptedPayload.keyId,
    metadata,
    object.encryptedPayload as EncryptedSyncObjectPayload
  )
  const sync = syncFromRemoteObject(object)

  if (object.objectType === 'vault_metadata') {
    const vault = { ...(payload as Vault), sync }
    store.vaults = upsertById(store.vaults, vault)
    return
  }

  if (object.objectType === 'vault_item') {
    const item = { ...(payload as VaultItem), sync }
    store.items = upsertById(store.items, item)
    return
  }

  const attachment = { ...(payload as VaultAttachment), sync }
  store.attachments = upsertById(store.attachments, attachment)
}

function removeRemoteObject(store: SyncStateContainer, object: SyncObjectView): void {
  if (object.objectType === 'vault_metadata') {
    store.vaults = store.vaults.filter((vault) => safeToServerUuid(vault.id) !== object.objectId)
    return
  }
  if (object.objectType === 'vault_item') {
    store.items = store.items.filter((item) => safeToServerUuid(item.id) !== object.objectId)
    return
  }
  store.attachments = store.attachments.filter((attachment) => safeToServerUuid(attachment.id) !== object.objectId)
}

function syncFromRemoteObject(object: SyncObjectView): SyncMetadata {
  return {
    revision: object.revision,
    baseRevision: object.revision,
    updatedByDeviceId: object.updatedByDeviceId ?? '',
    deletedAt: object.deletedAt ?? null,
    state: 'clean'
  }
}

function shouldRepairEmptyLocalSyncState(store: SyncStateContainer): boolean {
  if (!store.settings.sync.syncSpaceId || store.settings.sync.cursor <= 0) return false
  return store.vaults.length === 0 && store.items.length === 0 && store.attachments.length === 0
}

function shouldResetLocalObjectsForInitialSync(store: SyncStateContainer): boolean {
  if (!store.settings.sync.syncSpaceId || store.settings.sync.cursor > 0 || store.settings.sync.lastSyncAt) return false
  const objects = [...store.vaults, ...store.items, ...store.attachments]
  return objects.length > 0 && objects.some((object) => object.sync.state === 'clean')
}

async function restoreFromSyncSnapshot(input: {
  store: SyncStateContainer
  client: SyncApiClient
  deviceToken: string
  syncSpaceId: string
  vaultKey: Uint8Array
}): Promise<{ pulled: number; cursor: number }> {
  let pageToken: string | null = null
  let pulled = 0
  let cursor = input.store.settings.sync.cursor

  do {
    const snapshot = await input.client.snapshot(input.deviceToken, input.syncSpaceId, {
      pageToken,
      limit: 500
    })
    cursor = snapshot.snapshotCursor

    for (const object of snapshot.objects) {
      await applyRemoteSyncObject(input.store, object, input.vaultKey)
      pulled += 1
    }

    pageToken = snapshot.nextPageToken ?? null
  } while (pageToken)

  return { pulled, cursor }
}

function withCleanSync<T extends { sync: SyncMetadata }>(value: T, revision: number): T {
  return {
    ...value,
    sync: {
      ...value.sync,
      revision,
      baseRevision: revision,
      state: 'clean'
    }
  }
}

function upsertById<T extends { id: string }>(items: T[], value: T): T[] {
  return items.some((item) => item.id === value.id)
    ? items.map((item) => (item.id === value.id ? value : item))
    : [value, ...items]
}

function mergeById<T extends { id: string }>(items: T[], values: T[]): T[] {
  if (values.length === 0) return items
  const next = new Map(items.map((item) => [item.id, item]))
  for (const value of values) {
    next.set(value.id, value)
  }
  return [...next.values()]
}

function countItemsByVault(items: VaultItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    if (!item.sync.deletedAt) {
      counts[item.vaultId] = (counts[item.vaultId] ?? 0) + 1
    }
    return counts
  }, {})
}

function shouldPushSync(sync: SyncMetadata): boolean {
  return sync.state === 'dirty' || sync.state === 'pending'
}

function toServerUuid(id: string): string {
  const uuid = safeToServerUuid(id)
  if (!uuid) throw new Error('syncUnsupportedId')
  return uuid
}

function safeToServerUuid(id: string): string | null {
  const match = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  return match ? match[0].toLowerCase() : null
}

function serverIdsHasLocalId(serverIds: Set<string>, localId: string): boolean {
  const serverId = safeToServerUuid(localId)
  return serverId ? serverIds.has(serverId) : false
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

interface NormalizedLoadedData {
  data: DesktopVaultStoreData
  legacyPayloads: Record<string, DesktopVaultPayload>
  hasLegacyPlaintext: boolean
}

function normalizeLoadedData(data: DesktopVaultStoreData | null, systemLocale: SupportedLocale): NormalizedLoadedData {
  const locale = isSupportedLocale(data?.settings?.locale) ? data.settings.locale : systemLocale
  const normalizedUsers = normalizeUsers(data)
  const users = normalizedUsers.users
  const activeUserId = users.some((user) => user.id === data?.activeUserId)
    ? data?.activeUserId ?? null
    : users[0]?.id ?? null
  const activeUser = users.find((user) => user.id === activeUserId) ?? null

  return {
    data: {
      schemaVersion: DESKTOP_STORE_SCHEMA_VERSION,
      activeUserId,
      users,
      settings: {
        locale,
        deviceId: data?.settings?.deviceId || `device-${crypto.randomUUID()}`,
        layout: normalizeLayout(data?.settings?.layout),
        logging: normalizeLoggingSettings(data?.settings?.logging),
        shortcuts: normalizeShortcutSettings(data?.settings?.shortcuts),
        security: normalizeSecuritySettings(data?.settings?.security),
        sync: syncSettingsForUser(activeUser, data?.settings?.sync)
      }
    },
    legacyPayloads: normalizedUsers.legacyPayloads,
    hasLegacyPlaintext: normalizedUsers.hasLegacyPlaintext
  }
}

function normalizeUsers(data: DesktopVaultStoreData | null): {
  users: DesktopUserProfile[]
  legacyPayloads: Record<string, DesktopVaultPayload>
  hasLegacyPlaintext: boolean
} {
  const legacyPayloads: Record<string, DesktopVaultPayload> = {}

  const isOldSchema = Boolean(data && (data as { schemaVersion?: unknown }).schemaVersion !== DESKTOP_STORE_SCHEMA_VERSION)

  if (Array.isArray(data?.users)) {
    const users = data.users.map((user) => {
      const normalizedUser = normalizeUserProfile(user)
      const legacyPayload = extractLegacyPayload(user)
      if (!normalizedUser.crypto && (legacyPayload || hasLegacyPasswordAuth(user) || isOldSchema)) {
        legacyPayloads[normalizedUser.id] = legacyPayload ?? emptyLegacyPayload()
      }
      return normalizedUser
    })

    return {
      users,
      legacyPayloads,
      hasLegacyPlaintext: Object.keys(legacyPayloads).length > 0
    }
  }

  const legacyPayload = extractLegacyPayload(data) ?? (isOldSchema ? emptyLegacyPayload() : null)

  if (!legacyPayload) {
    return {
      users: [],
      legacyPayloads,
      hasLegacyPlaintext: false
    }
  }

  const now = new Date().toISOString()
  const userId = `user-${crypto.randomUUID()}`
  legacyPayloads[userId] = legacyPayload
  return {
    users: [
      {
        id: userId,
        username: '',
        displayName: '',
        createdAt: now,
        updatedAt: now,
        sync: { ...DEFAULT_SYNC_SETTINGS },
        crypto: null
      }
    ],
    legacyPayloads,
    hasLegacyPlaintext: true
  }
}

function extractLegacyPayload(value: unknown): DesktopVaultPayload | null {
  const record = value as {
    vaults?: unknown
    items?: unknown
    attachments?: unknown
  } | null
  const vaults = Array.isArray(record?.vaults) ? (record.vaults as Vault[]) : []
  const items = Array.isArray(record?.items) ? (record.items as VaultItem[]) : []
  const attachments = Array.isArray(record?.attachments) ? (record.attachments as VaultAttachment[]) : []

  if (!vaults.length && !items.length && !attachments.length) return null
  return { vaults, items, attachments }
}

function hasLegacyPasswordAuth(value: unknown): boolean {
  return Boolean((value as { passwordAuth?: unknown } | null)?.passwordAuth)
}

function emptyLegacyPayload(): DesktopVaultPayload {
  return {
    vaults: [],
    items: [],
    attachments: []
  }
}

function ensurePayloadHasVault(payload: DesktopVaultPayload, deviceId: string, locale: SupportedLocale): DesktopVaultPayload {
  if (payload.vaults.length > 0) return payload

  const vault = createDefaultVault(deviceId, locale)
  return {
    vaults: [vault],
    items: payload.items.map((item) => ({
      ...item,
      vaultId: vault.id
    })),
    attachments: payload.attachments.map((attachment) => ({
      ...attachment,
      vaultId: vault.id
    }))
  }
}

async function migrateLegacyPayload(
  userId: string,
  payload: DesktopVaultPayload,
  vaultKey: Uint8Array,
  keyId: string
): Promise<{ payload: DesktopVaultPayload; cleanupRefs: Array<{ ref: string; attachmentId: string }> }> {
  const attachments: VaultAttachment[] = []
  const cleanupRefs: Array<{ ref: string; attachmentId: string }> = []
  const now = new Date().toISOString()

  for (const attachment of payload.attachments ?? []) {
    if (!attachment.encryptedBlobRef) {
      attachments.push(markAttachmentMissing(attachment, now))
      continue
    }

    try {
      const migrated = await migrateLegacyAttachmentBlob(
        userId,
        attachment.id,
        attachment.fileName,
        attachment.encryptedBlobRef,
        vaultKey,
        keyId
      )
      if (attachment.encryptedBlobRef !== migrated.encryptedBlobRef) {
        cleanupRefs.push({ ref: attachment.encryptedBlobRef, attachmentId: attachment.id })
      }

      attachments.push({
        ...attachment,
        checksumSha256: attachment.checksumSha256 || migrated.checksumSha256,
        encryptedBlobRef: migrated.encryptedBlobRef,
        state: 'available',
        updatedAt: now,
        sync: {
          ...attachment.sync,
          revision: (attachment.sync?.revision ?? 0) + 1,
          baseRevision: attachment.sync?.revision ?? 0,
          state: 'dirty'
        }
      })
    } catch {
      attachments.push(markAttachmentMissing(attachment, now))
    }
  }

  return {
    payload: {
      vaults: payload.vaults,
      items: payload.items,
      attachments
    },
    cleanupRefs
  }
}

function markAttachmentMissing(attachment: VaultAttachment, now: string): VaultAttachment {
  return {
    ...attachment,
    encryptedBlobRef: '',
    state: 'missing',
    updatedAt: now,
    sync: {
      ...attachment.sync,
      revision: (attachment.sync?.revision ?? 0) + 1,
      baseRevision: attachment.sync?.revision ?? 0,
      state: 'dirty'
    }
  }
}

async function cleanupLegacyAttachmentRefs(refs: Array<{ ref: string; attachmentId: string }>): Promise<void> {
  for (const { ref, attachmentId } of refs) {
    try {
      await deleteAttachmentBlobRef(ref, attachmentId)
    } catch {
      // The encrypted payload is already persisted; stale legacy blobs are best-effort cleanup.
    }
  }
}

async function cleanupLocalSecretsForUser(user: DesktopUserProfile, storageBackend: StorageBackend): Promise<void> {
  const tasks: Array<Promise<{ status: string }>> = [
    deleteRecoveryKey(user.id),
    user.crypto?.fastUnlock
      ? deleteDeviceUnlockKey(
          user.crypto.fastUnlock.accountId,
          user.id,
          user.crypto.fastUnlock.deviceId,
          user.crypto.fastUnlock.deviceKeyId
        )
      : Promise.resolve({ status: 'deleted' }),
    deleteSyncDeviceToken(user.id).then(() => ({ status: 'deleted' }))
  ]
  const results = await Promise.allSettled(tasks)
  const failed = results.find((result) => result.status === 'rejected')
  if (failed?.status === 'rejected') {
    throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason))
  }
  if (storageBackend === 'tauri') {
    const notDeleted = results.find((result) => result.status === 'fulfilled' && result.value.status !== 'deleted')
    if (notDeleted?.status === 'fulfilled') {
      throw new Error(`failed to remove local secret: ${notDeleted.value.status}`)
    }
  }
}

async function cleanupLocalAttachmentRefs(refs: Array<{ ref: string; attachmentId: string }>): Promise<void> {
  for (const { ref, attachmentId } of refs) {
    await deleteAttachmentBlobRef(ref, attachmentId)
  }
}

function normalizeUserProfile(user: DesktopUserProfile): DesktopUserProfile {
  const cryptoConfig = normalizeUserCrypto(user.crypto ?? null)
  const isLegacySetupPlaceholder =
    !cryptoConfig && user.username === 'local' && (user.displayName === '\u672c\u5730\u7528\u6237' || user.displayName === 'Local user')

  return {
    id: user.id || `user-${crypto.randomUUID()}`,
    username: isLegacySetupPlaceholder ? '' : user.username,
    displayName: isLegacySetupPlaceholder ? '' : user.displayName,
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: user.updatedAt || new Date().toISOString(),
    sync: user.sync ? normalizeSyncSettings(user.sync) : null,
    crypto: cryptoConfig ?? null
  }
}

function normalizeUserCrypto(cryptoConfig: DesktopUserProfile['crypto']): DesktopUserProfile['crypto'] {
  if (!cryptoConfig) return null
  const { encryptedPayload: _encryptedPayload, ...normalized } = cryptoConfig as DesktopUserProfile['crypto'] & {
    encryptedPayload?: unknown
  }
  return normalized
}

function stripFastUnlockFromUser(user: DesktopUserProfile): DesktopUserProfile {
  if (!user.crypto?.fastUnlock) return user

  return {
    ...user,
    crypto: {
      ...user.crypto,
      fastUnlock: null
    }
  }
}

async function deleteFastUnlockSecretsForUsers(users: DesktopUserProfile[]): Promise<void> {
  await Promise.allSettled(
    users.flatMap((user) => {
      const fastUnlock = user.crypto?.fastUnlock
      return fastUnlock
        ? [
            deleteDeviceUnlockKey(
              fastUnlock.accountId,
              fastUnlock.userId,
              fastUnlock.deviceId,
              fastUnlock.deviceKeyId
            )
          ]
        : []
    })
  )
}

async function verifySessionUnlockCache(cache: SessionUnlockCache, password: string): Promise<boolean> {
  const verifierHash = await sessionPasswordVerifier(password, cache.verifierSalt, cache.userId, cache.keyId)
  return timingSafeEqualText(verifierHash, cache.verifierHash)
}

async function sessionPasswordVerifier(password: string, salt: string, userId: string, keyId: string): Promise<string> {
  const input = new TextEncoder().encode(`lockpass session unlock v1\0${userId}\0${keyId}\0${salt}\0${password.normalize('NFKC')}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return bytesToHex(new Uint8Array(digest))
}

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualText(left: string, right: string): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return diff === 0
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy
}

function backupUserProfile(user: DesktopUserProfile): DesktopUserProfile {
  const cryptoConfig = user.crypto
    ? {
        ...user.crypto,
        fastUnlock: null
      }
    : null

  return {
    ...user,
    sync: { ...DEFAULT_SYNC_SETTINGS },
    crypto: cryptoConfig
  }
}

function snapshotActiveUser(
  users: DesktopUserProfile[],
  activeUserId: string | null,
  sync: DesktopSyncSettings
): DesktopUserProfile[] {
  if (!activeUserId) return users

  const now = new Date().toISOString()
  return users.map((user) =>
    user.id === activeUserId
      ? {
          ...user,
          sync: normalizeSyncSettings(sync),
          updatedAt: now
        }
      : user
  )
}

function syncSettingsForUser(user: DesktopUserProfile | null, fallback?: Partial<DesktopSyncSettings> | null): DesktopSyncSettings {
  return normalizeSyncSettings(user?.sync ?? fallback)
}

function normalizeUsername(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-')
  return normalized || `user-${crypto.randomUUID().slice(0, 8)}`
}

function normalizeLayout(layout: Partial<DesktopLayoutSettings> | null | undefined): DesktopLayoutSettings {
  return {
    sidebarWidth: clampNumber(layout?.sidebarWidth, 190, 360, DEFAULT_LAYOUT.sidebarWidth),
    itemListWidth: clampNumber(layout?.itemListWidth, 260, 560, DEFAULT_LAYOUT.itemListWidth)
  }
}

function normalizeLoggingSettings(logging: Partial<DesktopLoggingSettings> | null | undefined): DesktopLoggingSettings {
  return {
    level: isDesktopLogLevel(logging?.level) ? logging.level : DEFAULT_LOGGING_SETTINGS.level
  }
}

function normalizeSecuritySettings(security: Partial<DesktopSecuritySettings> | null | undefined): DesktopSecuritySettings {
  return {
    startOnLogin: Boolean(security?.startOnLogin),
    autoLockOnLimit: security?.autoLockOnLimit ?? DEFAULT_SECURITY_SETTINGS.autoLockOnLimit,
    autoLockDelaySeconds: clampNumber(
      security?.autoLockDelaySeconds,
      0,
      3_600,
      DEFAULT_SECURITY_SETTINGS.autoLockDelaySeconds
    )
  }
}

function isDesktopLogLevel(level: unknown): level is DesktopLogLevel {
  return level === 'off' || level === 'error' || level === 'info' || level === 'debug'
}

function normalizeSyncSettings(sync: Partial<DesktopSyncSettings> | null | undefined): DesktopSyncSettings {
  const mode = sync?.mode === 'official' || sync?.mode === 'selfhost' ? sync.mode : DEFAULT_SYNC_SETTINGS.mode
  const normalizedSelfHostUrl = normalizeSyncServerUrl(sync?.serverUrl ?? '')
  const selfHostServerUrl =
    normalizedSelfHostUrl === LEGACY_DEFAULT_SELF_HOST_SYNC_SERVER_URL && !sync?.accountId && !sync?.deviceId
      ? ''
      : normalizedSelfHostUrl
  return {
    mode,
    serverUrl: mode === 'official'
      ? configuredOfficialApiUrl()
      : selfHostServerUrl,
    syncSpaceId: typeof sync?.syncSpaceId === 'string' && sync.syncSpaceId ? sync.syncSpaceId : null,
    accountId: typeof sync?.accountId === 'string' && sync.accountId ? sync.accountId : null,
    accountLabel: typeof sync?.accountLabel === 'string' && sync.accountLabel ? sync.accountLabel : null,
    deviceId: typeof sync?.deviceId === 'string' && sync.deviceId ? sync.deviceId : null,
    cursor: clampNumber(sync?.cursor, 0, Number.MAX_SAFE_INTEGER, DEFAULT_SYNC_SETTINGS.cursor),
    connectedAt: typeof sync?.connectedAt === 'string' && sync.connectedAt ? sync.connectedAt : null,
    lastSyncAt: typeof sync?.lastSyncAt === 'string' && sync.lastSyncAt ? sync.lastSyncAt : null
  }
}

function requireSelfHostServerUrl(value: string): string {
  const normalized = normalizeSyncServerUrl(value)
  if (!normalized) throw new Error('syncServerRequired')
  return normalized
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function createDefaultVault(deviceId: string, locale: SupportedLocale): Vault {
  const now = new Date().toISOString()

  return {
    id: `vault-${crypto.randomUUID()}`,
    schemaVersion: CORE_SCHEMA_VERSION,
    name: desktopMessages[locale].vault.defaultName,
    description: desktopMessages[locale].vault.defaultDescription,
    color: 'slate',
    icon: 'folder-lock',
    createdAt: now,
    updatedAt: now,
    sync: createSync(deviceId)
  }
}

function createSync(deviceId: string): SyncMetadata {
  return {
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: deviceId,
    deletedAt: null,
    state: 'dirty'
  }
}

function buildImportedVault(name: string, now: string, deviceId: string, locale: SupportedLocale): Vault {
  return {
    id: `vault-${crypto.randomUUID()}`,
    schemaVersion: CORE_SCHEMA_VERSION,
    name: name.trim() || desktopMessages[locale].vault.importedName,
    description: '',
    color: 'slate',
    icon: 'folder-lock',
    createdAt: now,
    updatedAt: now,
    sync: createSync(deviceId)
  }
}

function buildImportedItems(
  items: ExternalImportItem[],
  vaultId: string,
  now: string,
  deviceId: string,
  locale: SupportedLocale
): VaultItem[] {
  return items.map((item) => {
    const itemId = `item-${crypto.randomUUID()}`
    const fields = item.fields.map((field) => ({
      id: `field-${crypto.randomUUID()}`,
      kind: field.kind,
      label: field.label,
      value: field.value,
      sensitive: field.sensitive
    }))

    return {
      id: itemId,
      vaultId,
      schemaVersion: CORE_SCHEMA_VERSION,
      type: item.type,
      title: item.title.trim() || desktopMessages[locale].itemDefaults.imported,
      subtitle: buildSubtitle(item.type, fields, [], item.notes, locale),
      notes: item.notes.trim(),
      urls: item.urls.filter(Boolean),
      tags: [],
      favorite: false,
      archived: false,
      fields: fields.filter((field) => field.kind !== 'url'),
      attachmentIds: [],
      createdAt: now,
      updatedAt: now,
      sync: createSync(deviceId)
    }
  })
}

function markDeletedObject<T extends { sync: SyncMetadata; updatedAt: string }>(object: T, now: string, deviceId: string): T {
  return {
    ...object,
    updatedAt: now,
    sync: {
      revision: object.sync.revision + 1,
      baseRevision: object.sync.revision,
      updatedByDeviceId: deviceId,
      deletedAt: now,
      state: 'dirty'
    }
  }
}

function buildSubtitle(
  type: VaultItemType,
  fields: VaultItemField[],
  attachments: AttachmentDraft[],
  notes: string,
  locale: SupportedLocale
): string {
  const defaults = desktopMessages[locale].itemDefaults
  if (type === 'attachment') return formatMessage(defaults.attachmentFiles, { count: String(attachments.length) })
  if (type === 'payment-card') return fields.find((field) => field.kind === 'cardholder')?.value || defaults.paymentCard
  if (type === 'secure-note') return notes.trim().slice(0, 80) || defaults.secureNote

  const account = fields.find((field) => field.kind === 'username')?.value || defaults.account
  const website = fields.find((field) => field.kind === 'url')?.value || defaults.website
  return formatMessage(defaults.loginSubtitle, { account, website })
}

function formatMessage(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && supportedLocales.includes(value as SupportedLocale)
}
