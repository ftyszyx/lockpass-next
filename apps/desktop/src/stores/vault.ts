import { defineStore } from 'pinia'
import type {
  Vault,
  VaultAttachment,
  VaultItem,
  VaultItemField
} from '@lockpass/core'
import { desktopMessages, type SupportedLocale } from '@/i18n'
import { detectBrowserLocale, loadSystemLocale } from '@/services/locale'
import { createPerfTrace } from '@/services/perfTrace'
import { configuredOfficialApiUrl, configuredOfficialServerUrl } from '@/services/appConfig'
import { configureLogger, logDebug, logError, logInfo } from '@/services/logger'
import { normalizeShortcut, normalizeShortcutSettings } from '@/services/shortcuts'
import {
  closeAllVaultSessions,
  closeVaultSession,
  createUserCrypto,
  unlockUserCrypto,
  verifyUserCryptoCredentials,
  type DesktopVaultPayload,
  type DesktopUserCrypto
} from '@/services/masterPassword'
import {
  SyncApiClient,
  type SyncDeviceBindResponse,
  type SyncMode
} from '@/services/syncClient'
import {
  clearAttachmentBlobCache,
  countEncryptedObjectsByVault,
  deleteAttachmentBlobRef,
  deleteSyncDeviceToken,
  loadAttachmentBlobBytes,
  loadSecretKey,
  loadSyncDeviceToken,
  loadVaultStore,
  saveEncryptedAttachmentBlob,
  saveEncryptedObjects,
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
  type DesktopUserProfile,
  type DesktopVaultStoreData,
  type SecureSecretKeyResult
} from '@/services/vaultRepository'
import type { ExternalImportItem, ExternalImportVault, LockPassBackupPackageV1 } from '@/services/backup'
import { base64ToBytes, bytesToBase64, exportItemsToCsv } from '@/services/backup'
import {
  CORE_SCHEMA_VERSION,
  DEFAULT_SHORTCUTS,
  DEFAULT_SYNC_SETTINGS,
  DESKTOP_STORE_SCHEMA_VERSION,
  backupUserProfile,
  buildImportedItems,
  buildImportedVault,
  buildSubtitle,
  createSync,
  ensurePayloadHasVault,
  markDeletedObject,
  normalizeLoadedData,
  normalizeLoggingSettings,
  normalizeSecuritySettings,
  normalizeSyncSettings,
  normalizeUsername,
  requireSelfHostServerUrl,
  snapshotActiveUser,
  stripFastUnlockFromUser,
  syncSettingsForUser
} from './vault/model'
import { vaultGetters } from './vault/getters'
import {
  cleanupLegacyAttachmentRefs,
  cleanupLocalAttachmentRefs,
  migrateLegacyPayload
} from './vault/legacyMigration'
import {
  cleanupLocalSecretsForUser,
  deleteFastUnlockSecretsForUsers,
  saveAndVerifySecretKey
} from './vault/localSecrets'
import type {
  AttachmentDraft,
  CreateServerBackedUserPayload,
  CreateUserPayload,
  CreateUserResult,
  CreateVaultPayload,
  ImportItemsResult,
  ImportVaultsResult,
  OfficialSyncAuthorization,
  PendingSyncDeviceBindExchange,
  SecretKeyStorageStatus,
  RestoreServerAccountPayload,
  SaveItemPayload,
  SyncConnectPayload,
  SyncRunResult
} from './vault/types'
import { createVaultStoreState } from './vault/state'
import {
  deviceDisplayName,
  ensureSyncSpace,
  isSyncConnectionInvalid,
  parseSyncDeviceBindCallback,
  syncErrorLogMetadata,
  syncErrorMessage,
  syncServerUrlForSettings,
  webUrlForApiUrl
} from './vault/syncConnection'
import {
  applyAcceptedSyncObjects,
  applyConflictedSyncObjects,
  applyRemoteSyncObject,
  buildLocalEncryptedObjectRecords,
  buildSyncPushObjects,
  chunkArray,
  countItemsByVault,
  loadVaultMetadataFromLocalObjects,
  loadVaultScopedPayloadFromLocalObjects,
  mergeById,
  removeAcceptedDeletedObjects,
  resetLoadedObjectsForNewSyncTarget,
  restoreFromSyncSnapshot,
  shouldRepairEmptyLocalSyncState,
  shouldResetLocalObjectsForInitialSync,
  toServerUuid
} from './vault/syncObjects'
export const useVaultStore = defineStore('vault', {
  state: createVaultStoreState,
  getters: vaultGetters,
  actions: {
    async hydrate() {
      this.hydrated = false
      this.storageError = ''
      try {
        await closeAllVaultSessions().catch(() => undefined)
        await logDebug('vault hydrate started')
        const [loaded, systemLocale] = await Promise.all([
          loadVaultStore(),
          loadSystemLocale()
        ])
        this.storageBackend = loaded.backend
        const normalized = normalizeLoadedData(loaded.data, systemLocale)
        const data = normalized.data
        await deleteFastUnlockSecretsForUsers(data.users)
        data.users = data.users.map(stripFastUnlockFromUser)
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
          activeUser: Boolean(data.activeUserId)
        })
      } catch (error) {
        this.storageError = error instanceof Error ? error.message : String(error)
        await logError('vault hydrate failed', { error: this.storageError })
        const fallback = normalizeLoadedData(null, detectBrowserLocale()).data
        configureLogger(fallback.settings.logging.level)
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

        if (this.activeUserId && this.vaultSessionId && this.activeKeyId) {
          await upsertEncryptedObjects(
            this.activeUserId,
            await buildLocalEncryptedObjectRecords({
              sessionId: this.vaultSessionId,
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
      this.requireVaultSession()

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
    startServerAccountAuthorization(input: SyncConnectPayload & { authMode?: 'login' | 'register' }): OfficialSyncAuthorization {
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
      loginUrl.searchParams.set('authMode', input.authMode ?? 'login')
      return { loginUrl: loginUrl.toString() }
    },
    parseServerAccountAuthorizationCallback(callbackUrl: string): PendingSyncDeviceBindExchange {
      return parseSyncDeviceBindCallback(callbackUrl)
    },
    async completeOfficialSyncAuthorization(callbackOrCode: string): Promise<void> {
      const user = this.activeUser
      if (!user?.crypto) throw new Error('syncLocked')
      this.requireVaultSession()

      const exchange = parseSyncDeviceBindCallback(callbackOrCode)
      await this.applySyncExchange(exchange.mode, exchange.serverUrl, exchange)
    },
    async applyPendingServerAccountExchange(exchange: PendingSyncDeviceBindExchange): Promise<void> {
      await this.applySyncExchange(exchange.mode, exchange.serverUrl, exchange)
    },
    async createServerBackedUser(input: CreateServerBackedUserPayload): Promise<CreateUserResult> {
      const existing = this.users.find((user) => user.sync?.accountId === input.exchange.account.id || user.id === input.exchange.account.id)
      if (existing?.crypto) {
        throw new Error('duplicate-username')
      }
      if (!existing && this.unlocked) {
        await this.persist()
      }

      const now = new Date().toISOString()
      const accountLabel = input.exchange.account.email ?? input.exchange.account.displayName ?? input.exchange.account.id
      const sync = normalizeSyncSettings({
        mode: input.exchange.mode,
        serverUrl: input.exchange.serverUrl,
        syncSpaceId: input.initialVault.syncSpaceId,
        accountId: input.exchange.account.id,
        accountLabel,
        deviceId: input.exchange.device.id,
        cursor: input.initialVault.cursor,
        connectedAt: now,
        lastSyncAt: now
      })
      const user: DesktopUserProfile = {
        id: input.exchange.account.id,
        username: normalizeUsername(accountLabel),
        displayName: accountLabel,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        sync,
        crypto: input.initialVault.crypto
      }

      await saveSyncDeviceToken(user.id, input.exchange.deviceToken)
      this.users = existing
        ? this.users.map((candidate) => (candidate.id === existing.id ? user : candidate))
        : [...this.users, user]
      await this.closeCurrentVaultSession()
      this.activeUserId = user.id
      this.settings.sync = sync
      this.unlocked = true
      this.vaultSessionId = input.initialVault.sessionId
      this.activeKeyId = input.initialVault.crypto.keyId
      this.loadActiveUserData(input.initialVault.payload)
      await upsertEncryptedObjects(
        user.id,
        await buildLocalEncryptedObjectRecords({
          sessionId: input.initialVault.sessionId,
          keyId: input.initialVault.crypto.keyId,
          vaults: input.initialVault.payload.vaults,
          items: input.initialVault.payload.items,
          attachments: input.initialVault.payload.attachments
        })
      )
      const secretKeyStorage = await saveAndVerifySecretKey(user.id, input.secretKey)
      if (secretKeyStorage === 'failed') {
        this.storageError = 'secret-key-save-verification-failed'
      }
      this.clearOfficialLoginState()
      await this.persist()
      return {
        user,
        secretKey: input.secretKey,
        secretKeyStorage
      }
    },
    async restoreServerAccount(input: RestoreServerAccountPayload): Promise<void> {
      const existing = this.users.find((user) => user.sync?.accountId === input.exchange.account.id)
      if (existing?.crypto) {
        throw new Error('duplicate-username')
      }

      const client = new SyncApiClient(input.exchange.serverUrl)
      const syncSpace = await ensureSyncSpace(
        client,
        input.exchange.deviceToken,
        input.exchange.account.email ?? input.exchange.account.displayName
      )
      const snapshot = await client.snapshot(input.exchange.deviceToken, syncSpace.id)
      const wrappedVaultKey = snapshot.wrappedVaultKeys?.[0] as
        | {
          vaultId: string
          keyId: string
          kdfParams: DesktopUserCrypto['kdfParams']
          wrappedVaultKey: DesktopUserCrypto['wrappedVaultKey']
        }
        | undefined
      if (!wrappedVaultKey) {
        throw new Error('serverVaultKeyMissing')
      }

      const userId = input.exchange.account.id
      const userCrypto: DesktopUserCrypto = {
        keyId: wrappedVaultKey.keyId,
        kdfParams: wrappedVaultKey.kdfParams,
        wrappedVaultKey: wrappedVaultKey.wrappedVaultKey
      }
      const unlocked = await unlockUserCrypto(userId, input.password, input.secretKey, userCrypto)
      const remotePayload: DesktopVaultPayload = { vaults: [], items: [], attachments: [] }
      for (const object of snapshot.objects) {
        await applyRemoteSyncObject(remotePayload, object, unlocked.sessionId)
      }
      const payload = ensurePayloadHasVault(remotePayload, input.exchange.device.id, this.settings.locale)
      const now = new Date().toISOString()
      const sync = normalizeSyncSettings({
        mode: input.exchange.mode,
        serverUrl: input.exchange.serverUrl,
        syncSpaceId: syncSpace.id,
        accountId: input.exchange.account.id,
        accountLabel: input.exchange.account.email ?? input.exchange.account.displayName,
        deviceId: input.exchange.device.id,
        cursor: snapshot.snapshotCursor,
        connectedAt: now,
        lastSyncAt: now
      })
      const user: DesktopUserProfile = {
        id: userId,
        username: normalizeUsername(input.exchange.account.email ?? input.exchange.account.displayName ?? userId),
        displayName: input.exchange.account.email ?? input.exchange.account.displayName ?? userId,
        createdAt: now,
        updatedAt: now,
        sync,
        crypto: userCrypto
      }

      const secretKeyStorage = await saveAndVerifySecretKey(user.id, input.secretKey)
      if (input.requireSecretKeyStorage && secretKeyStorage !== 'saved') {
        throw new Error('secretKeyStorageRequired')
      }

      await saveSyncDeviceToken(user.id, input.exchange.deviceToken)
      this.users = existing
        ? this.users.map((candidate) => (candidate.id === existing.id ? user : candidate))
        : [...this.users, user]
      await this.closeCurrentVaultSession()
      this.activeUserId = user.id
      this.settings.sync = sync
      this.unlocked = true
      this.vaultSessionId = unlocked.sessionId
      this.activeKeyId = userCrypto.keyId
      this.loadActiveUserData(payload)
      await upsertEncryptedObjects(
        user.id,
        await buildLocalEncryptedObjectRecords({
          sessionId: unlocked.sessionId,
          keyId: userCrypto.keyId,
          vaults: payload.vaults,
          items: payload.items,
          attachments: payload.attachments
        })
      )
      this.clearOfficialLoginState()
      await this.persist()
    },
    async applySyncExchange(mode: SyncMode, serverUrl: string, exchange: SyncDeviceBindResponse): Promise<void> {
      const user = this.activeUser
      if (!user?.crypto) throw new Error('syncLocked')

      await saveSyncDeviceToken(user.id, exchange.deviceToken)
      const client = new SyncApiClient(serverUrl)
      const syncSpace = await ensureSyncSpace(client, exchange.deviceToken, user.displayName || user.username)
      await this.ensureAllVaultObjectsLoaded()
      resetLoadedObjectsForNewSyncTarget(this.vaults, this.items, this.attachments, this.settings.deviceId)
      const wrappedVaultId = user.crypto.wrappedVaultKey.aad.vaultId || this.vaults.find((vault) => !vault.sync.deletedAt)?.id
      if (wrappedVaultId) {
        await client.createWrappedVaultKey(exchange.deviceToken, {
          syncSpaceId: syncSpace.id,
          vaultId: toServerUuid(wrappedVaultId),
          keyId: user.crypto.keyId,
          wrapType: 'user_wrapped',
          kdfParams: user.crypto.kdfParams,
          wrappedVaultKey: user.crypto.wrappedVaultKey
        })
      }
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
      const { sessionId, keyId } = this.requireVaultSession()
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
          sessionId
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
        sessionId,
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
            await applyRemoteSyncObject(this, event.objectSnapshot, sessionId)
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
      const created = await createUserCrypto(userId, input.password, payload, input.secretKey)
      const migrated = legacyPayload
        ? await migrateLegacyPayload(userId, payload, created.sessionId, created.crypto.keyId)
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
      await this.closeCurrentVaultSession()
      this.activeUserId = user.id
      this.settings.sync = syncSettingsForUser(user)
      this.unlocked = true
      this.vaultSessionId = created.sessionId
      this.activeKeyId = created.crypto.keyId
      this.loadActiveUserData(migrated.payload)
      delete this.legacyPayloads[user.id]
      let secretKeyStorage: SecretKeyStorageStatus = 'failed'
      try {
        secretKeyStorage = await saveAndVerifySecretKey(user.id, created.secretKey)
        if (secretKeyStorage === 'failed') {
          this.storageError = 'secret-key-save-verification-failed'
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
        secretKeyStorage
      })
      return { user, secretKey: created.secretKey, secretKeyStorage }
    },
    async loadSavedSecretKeyForActiveUser(): Promise<SecureSecretKeyResult> {
      const user = this.activeUser
      if (!user?.crypto) return { status: 'missing' }
      return loadSecretKey(user.id)
    },
    async revealSecretKey(password: string): Promise<SecureSecretKeyResult> {
      const user = this.activeUser
      if (!this.unlocked || !user?.crypto) return { status: 'missing' }

      const savedSecretKey = await loadSecretKey(user.id)
      if (savedSecretKey.status !== 'loaded') return savedSecretKey

      await verifyUserCryptoCredentials(user.id, password, savedSecretKey.secretKey, user.crypto)
      return savedSecretKey
    },
    async saveSecretKeyForActiveUser(password: string, secretKey: string): Promise<SecretKeyStorageStatus> {
      const user = this.activeUser
      if (!this.unlocked || !user?.crypto) return 'failed'

      await verifyUserCryptoCredentials(user.id, password, secretKey, user.crypto)

      return this.saveVerifiedSecretKeyForActiveUser(secretKey)
    },
    async saveVerifiedSecretKeyForActiveUser(secretKey: string): Promise<SecretKeyStorageStatus> {
      const user = this.activeUser
      if (!this.unlocked || !user?.crypto) return 'failed'

      try {
        const storageStatus = await saveAndVerifySecretKey(user.id, secretKey)
        if (storageStatus === 'failed') {
          this.storageError = 'secret-key-save-verification-failed'
        }
        return storageStatus
      } catch (error) {
        this.storageError = error instanceof Error ? error.message : String(error)
        return 'failed'
      }
    },
    async unlockActiveUser(password: string, secretKey: string): Promise<boolean> {
      const user = this.activeUser
      if (!user?.crypto) return false
      const keyId = user.crypto.keyId
      const perf = createPerfTrace('unlockActiveUser')

      try {
        const unlocked = await unlockUserCrypto(user.id, password, secretKey, user.crypto, perf)
        perf.mark('store.cryptoReady')
        await this.closeCurrentVaultSession()
        this.unlocked = true
        this.vaultSessionId = unlocked.sessionId
        this.activeKeyId = keyId
        await perf.measure('storage.loadInitialVaultObjects', () =>
          this.loadInitialUnlockedUserData(user.id, unlocked.sessionId, keyId)
        )
        perf.mark('store.sessionStateLoaded')
        await this.persist()
        perf.done({
          vaults: this.vaults.length,
          items: this.items.length,
          attachments: this.attachments.length
        })
        return true
      } catch (error) {
        await this.closeCurrentVaultSession()
        perf.done({
          failed: true,
          error: error instanceof Error ? error.message : String(error)
        })
        this.unlocked = false
        this.activeKeyId = null
        this.clearSessionData()
        return false
      }
    },
    async closeCurrentVaultSession(): Promise<void> {
      const sessionId = this.vaultSessionId
      this.vaultSessionId = null
      if (sessionId) await closeVaultSession(sessionId).catch(() => undefined)
    },
    async lock(): Promise<void> {
      await this.closeCurrentVaultSession()
      this.unlocked = false
      this.vaultSessionId = null
      this.activeKeyId = null
      this.clearSessionData()
    },
    async switchUser(userId: string) {
      if (userId === this.activeUserId) return
      if (!this.users.some((user) => user.id === userId)) return

      if (this.unlocked) await this.persist()
      await this.closeCurrentVaultSession()
      this.activeUserId = userId
      this.unlocked = false
      this.vaultSessionId = null
      this.activeKeyId = null
      this.query = ''
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
      await this.closeCurrentVaultSession()

      this.users = remainingUsers
      this.activeUserId = nextUser?.id ?? null
      this.unlocked = false
      this.vaultSessionId = null
      this.activeKeyId = null
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
    async loadInitialUnlockedUserData(userId: string, sessionId: string, keyId: string): Promise<void> {
      const [vaults, counts] = await Promise.all([
        loadVaultMetadataFromLocalObjects(userId, sessionId, keyId),
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
    requireVaultSession(): { sessionId: string; keyId: string } {
      if (!this.unlocked || !this.vaultSessionId || !this.activeKeyId) {
        throw new Error('syncLocked')
      }
      return { sessionId: this.vaultSessionId, keyId: this.activeKeyId }
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
      const { sessionId, keyId } = this.requireVaultSession()
      const userId = this.activeUserId
      if (!userId || this.loadedVaultIds.includes(vaultId)) return
      const payload = await loadVaultScopedPayloadFromLocalObjects(userId, vaultId, sessionId, keyId)
      this.items = mergeById(this.items, payload.items)
      this.attachments = mergeById(this.attachments, payload.attachments)
      this.loadedVaultIds = [...new Set([...this.loadedVaultIds, vaultId])]
    },
    async ensureAllVaultObjectsLoaded(): Promise<void> {
      const { sessionId, keyId } = this.requireVaultSession()
      const userId = this.activeUserId
      if (!userId) return
      const missingVaultIds = this.vaults
        .filter((vault) => !vault.sync.deletedAt && !this.loadedVaultIds.includes(vault.id))
        .map((vault) => vault.id)
      for (const vaultId of missingVaultIds) {
        const payload = await loadVaultScopedPayloadFromLocalObjects(userId, vaultId, sessionId, keyId)
        this.items = mergeById(this.items, payload.items)
        this.attachments = mergeById(this.attachments, payload.attachments)
      }
      this.loadedVaultIds = [...new Set([...this.loadedVaultIds, ...missingVaultIds])]
    },
    async createVault(input: CreateVaultPayload): Promise<Vault> {
      this.requireVaultSession()
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
      this.requireVaultSession()
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
      this.requireVaultSession()
      const now = new Date().toISOString()
      const existing = input.editingItemId
        ? this.items.find((item) => item.id === input.editingItemId) ?? null
        : null
      const itemId = existing?.id ?? `item-${crypto.randomUUID()}`
      const urlFields = collectUrlFieldValues(input.fields)
      const visibleFields = stripUrlFields(input.fields)
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
      const { sessionId, keyId } = this.requireVaultSession()
      await this.ensureAllVaultObjectsLoaded()
      await logInfo('backup export started', {
        vaults: this.vaults.length,
        items: this.items.length,
        attachments: this.attachments.length
      })
      const records = await buildLocalEncryptedObjectRecords({
        sessionId,
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
      await this.closeCurrentVaultSession()
      this.vaultSessionId = null
      this.activeKeyId = null
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
      this.requireVaultSession()
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
      this.requireVaultSession()
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
      this.requireVaultSession()
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

function collectUrlFieldValues(fields: VaultItemField[]): string[] {
  return fields.flatMap((field) => {
    if (field.kind === 'url') return [field.value]
    return collectUrlFieldValues(field.children ?? [])
  })
}

function stripUrlFields(fields: VaultItemField[]): VaultItemField[] {
  return fields
    .filter((field) => field.kind !== 'url')
    .flatMap((field) => {
      if (!field.children?.length) return field
      const children = stripUrlFields(field.children)
      if (field.kind === 'group' && children.length === 0) return []
      return children.length ? [{ ...field, children }] : [field]
    })
}
