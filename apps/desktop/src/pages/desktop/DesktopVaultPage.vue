<script setup lang="ts">
import { type VaultItem } from "@lockpass/core";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, provide, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { setI18nLocale, type SupportedLocale } from "@/i18n";
import {
  startDeepLinkListener,
  subscribeToDeepLinks,
} from "@/services/deepLink";
import { openLogDir } from "@/services/logger";
import { createPerfTrace } from "@/services/perfTrace";
import type { SyncMode } from "@/services/syncClient";
import { shortcutMatchesEvent } from "@/services/shortcuts";
import {
  openExternalUrl,
  type DesktopLogLevel,
  type DesktopSecuritySettings,
  type ShortcutAction,
  type ShortcutScope,
} from "@/services/vaultRepository";
import {
  useVaultStore,
} from "@/stores/vault";
import DesktopHeader from "./components/DesktopHeader.vue";
import DesktopStartupState from "./components/DesktopStartupState.vue";
import DesktopVaultModalLayer from "./components/DesktopVaultModalLayer.vue";
import DesktopVaultWorkspace from "./components/DesktopVaultWorkspace.vue";
import { desktopPageContextKey } from "./desktopPageContext";
import { getInitials } from "./formatters";
import type {
  DetailTab,
  DrawerName,
  ManagementPageName,
  ModalName,
  OperationProgressState,
  ToastState,
  VaultDraft,
} from "./types";
import { useBackupActions } from "./useBackupActions";
import { useColumnResize } from "./useColumnResize";
import { useItemEditor } from "./useItemEditor";
import { useUserSessionFlow } from "./useUserSessionFlow";

const { t } = useI18n();
const vaultStore = useVaultStore();
const {
  filteredItems,
  selectedItem,
  selectedItemAttachments,
  visibleAttachments,
  visibleItems,
  writableVaults,
} = storeToRefs(vaultStore);

const workspaceRef = ref<InstanceType<typeof DesktopVaultWorkspace> | null>(
  null,
);
const mainGrid = computed(
  () => workspaceRef.value?.mainGridElement ?? null,
);
const activeTab = ref<DetailTab>("details");
const showSensitive = ref(false);
const activeDrawer = ref<DrawerName>(null);
const activeManagementPage = ref<ManagementPageName | null>(null);
const activeModal = ref<ModalName>(null);
const quickQuery = ref("");
const revealedRecoveryKey = ref("");
const revealError = ref("");
const revealRecoveryKeyIssue = ref<"missing" | "unsupported" | "">("");
const savingRecoveryKeyToDevice = ref(false);
const pendingDeleteVaultId = ref<string | null>(null);
const deletingVault = ref(false);
const sensitiveViewKey = ref(0);
const initializing = ref(true);
const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine);
let clipboardCleanupTimer: number | null = null;
let clipboardCleanupValue = "";
let deepLinkUnlisten: (() => void) | null = null;
let deepLinkListenerStop: (() => void) | null = null;
let autoLockTimer: number | null = null;
let autoSyncTimer: number | null = null;

const toast = reactive<ToastState>({ visible: false, message: "" });
const operationProgress = reactive({
  visible: false,
  title: "",
  body: "",
});
let operationProgressToken = 0;

const vaultDraft = reactive<VaultDraft>({
  name: "",
  description: "",
  color: "slate",
  icon: "folder-lock",
});

const {
  mainGridStyle,
  resizingTarget,
  startColumnResize,
  onResizeHandleKeydown,
} = useColumnResize(vaultStore, mainGrid);

const activeUserName = computed(() => vaultStore.activeUser?.displayName ?? "");
const activeUserInitials = computed(() => getInitials(activeUserName.value));
const pendingDeleteVault = computed(
  () =>
    vaultStore.vaults.find(
      (vault) => vault.id === pendingDeleteVaultId.value,
    ) ?? null,
);
const pendingDeleteVaultItemCount = computed(() =>
  pendingDeleteVaultId.value
    ? vaultStore.vaultCount(pendingDeleteVaultId.value)
    : 0,
);
const connectionStatus = computed(() => {
  if (!isOnline.value) return "offline";
  if (
    vaultStore.autoSync.lastError === "syncNetworkBlocked" ||
    vaultStore.officialLogin.lastError === "syncNetworkBlocked"
  ) {
    return "serverUnavailable";
  }
  return "online";
});
const {
  addDraftExtra,
  addWebsiteField,
  backToItemTypePicker,
  clearPasswordTarget,
  editingItemId,
  generatedPassword,
  itemDraft,
  itemError,
  moveDraftField,
  onFilesSelected,
  openEditItem,
  openNewItem,
  openPasswordGenerator,
  openStandalonePasswordGenerator,
  passwordOptions,
  passwordTargetFieldId,
  pickingItemType,
  regeneratePassword,
  removeDraftAttachment,
  removeDraftAttachmentBlock,
  removeDraftField,
  resetItemDraft,
  saveItem,
  startNewItem,
  uploadingFiles,
  useGeneratedPassword,
} = useItemEditor({
  activeDrawer,
  activeModal,
  selectedItem,
  selectedItemAttachments,
  showToast,
  t,
  vaultStore,
  writableVaults,
});

const {
  applyPendingServerExchange,
  applyWebDeviceBindingIfAvailable,
  authError,
  backToUserDraftFromRecoveryKey,
  closeSwitchUserConfirm,
  closeUserSetup,
  confirmSwitchUser,
  createNewUserFromLock,
  createUser,
  creatingUser,
  generatedRecoveryKey,
  hasLegacyImport,
  openAddUserFromManagement,
  openUserManagement,
  pendingServerExchange,
  pendingSwitchUserName,
  prepareUserRecoveryKey,
  recoveryUserName,
  requestSwitchUser,
  resetUserDraft,
  restoreExistingServerAccount,
  setupServerAccountFlow,
  setupServerAccountLabel,
  setupServerBusy,
  setupServerConnected,
  setupServerMode,
  setupServerUrl,
  showUnavailableRecoveryQr,
  signOutCurrentUser,
  signingOutCurrentUser,
  switchUser,
  unlockPassword,
  unlockRecoveryKey,
  unlockingVault,
  updateSetupServerMode,
  updateSetupServerUrl,
  userDraft,
  userSetupInitialMode,
} = useUserSessionFlow({
  activeDrawer,
  activeModal,
  clearPendingClipboard,
  clearSensitiveUiState,
  promptServerSignInIfNeeded,
  scheduleAutoSync,
  showToast,
  syncErrorToast,
  t,
  vaultStore,
});

const {
  backupBusy,
  copySavedBackupPath,
  createBackup,
  exportCsv,
  importCsv,
  importLegacyBackup,
  openSavedBackupDirectory,
  restoreBackup,
  savedBackupResult,
} = useBackupActions({
  copyValue,
  lockAfterRestore: () => {
    activeManagementPage.value = null;
    activeModal.value = "lock";
  },
  runWithOperationProgress,
  showToast,
  t,
  vaultStore,
});

provide(
  desktopPageContextKey,
  reactive({
    activeDrawer,
    activeKeyId: computed(() => vaultStore.activeKeyId),
    activeManagementPage,
    activeModal,
    activeTab,
    activeUserInitials,
    activeUserName,
    authError,
    backupBusy,
    canUseGeneratedPassword: computed(() => passwordTargetFieldId.value !== null),
    connectionStatus,
    creatingUser,
    deletingVault,
    editingItemId,
    filteredItems,
    generatedPassword,
    generatedRecoveryKey,
    hasLegacyImport,
    itemDraft,
    itemError,
    keyId: computed(() => vaultStore.activeKeyId),
    mainGridStyle,
    operationProgress,
    passwordOptions,
    pendingDeleteVault,
    pendingDeleteVaultItemCount,
    pendingSwitchUserName,
    pickingItemType,
    quickQuery,
    recoveryUserName,
    revealError,
    revealedRecoveryKey,
    revealRecoveryKeyIssue,
    resizingTarget,
    savedBackupResult,
    savingRecoveryKeyToDevice,
    selectedItem,
    selectedItemAttachments,
    sensitiveViewKey,
    serverAccountLabel: setupServerAccountLabel,
    serverBusy: setupServerBusy,
    serverConnected: setupServerConnected,
    serverFirst: setupServerAccountFlow,
    serverMode: setupServerMode,
    serverUrl: setupServerUrl,
    showSensitive,
    signingOutCurrentUser,
    toast,
    unlockingVault,
    unlockPassword,
    unlockRecoveryKey,
    uploadingFiles,
    userDraft,
    userSetupInitialMode,
    vaultDraft,
    vaultHasUsers: computed(() => vaultStore.hasUsers),
    vaultHydrated: computed(() => vaultStore.hydrated),
    vaultKey: computed(() => vaultStore.vaultKey),
    vaultNeedsUserSetup: computed(() => vaultStore.needsUserSetup),
    vaultStore,
    vaultUnlocked: computed(() => vaultStore.unlocked),
    visibleAttachments,
    visibleItems,
    visibleItemsCount: computed(() => visibleItems.value.length),
    addDraftExtra,
    addWebsiteField,
    backToItemTypePicker,
    backToUserDraftFromRecoveryKey,
    changeLocale,
    changeLogLevel,
    changeSecuritySettings,
    changeShortcut,
    clearAuthError: () => {
      authError.value = "";
    },
    closeActiveModal: () => {
      activeModal.value = null;
    },
    closeDrawer,
    closeManagement: () => {
      activeManagementPage.value = null;
    },
    closeRecoveryKeyModal,
    closeSavedBackup: () => {
      savedBackupResult.value = null;
    },
    closeSwitchUserConfirm,
    confirmDeleteVault,
    confirmSwitchUser,
    copySavedBackupPath,
    copyValue,
    createBackup,
    createNewUserFromLock,
    createUser,
    exportCsv,
    hideOperationProgress,
    importCsv,
    importLegacyBackup,
    lockApp,
    moveDraftField,
    notReady: () => showToast(t("toast.notReady")),
    onFilesSelected,
    onResizeHandleKeydown,
    openDesktopLogDir,
    openEditItem,
    openImportFromItemPicker,
    openInitialServerLogin,
    openManagement,
    openNewItem,
    openNewVault,
    openPasswordGenerator,
    openQuickSearch,
    openRecoveryKeyModal,
    openSavedBackupDirectory,
    openSignOutCurrentUserModal,
    prepareUserRecoveryKey,
    regeneratePassword,
    removeDraftAttachment,
    removeDraftAttachmentBlock,
    removeDraftField,
    requestDeleteVault,
    requestSwitchUser,
    resetShortcuts,
    restoreBackup,
    restoreExistingServerAccount,
    saveItem,
    saveRecoveryKeyToDevice,
    saveVault,
    securityChecked: () => showToast(t("toast.securityChecked")),
    selectItem,
    selectQuickResult,
    showOperationProgress,
    showToast,
    showUnavailableRecoveryQr,
    signOutCurrentUser,
    startColumnResize,
    startNewItem,
    updateActiveTab: (tab: DetailTab) => {
      activeTab.value = tab;
    },
    updateManagementPage: (page: ManagementPageName) => {
      activeManagementPage.value = page;
    },
    updateQuickQuery: (query: string) => {
      quickQuery.value = query;
    },
    updateSetupServerMode,
    updateSetupServerUrl,
    updateShowSensitive: (show: boolean) => {
      showSensitive.value = show;
    },
    updateUnlockPassword: (value: string) => {
      unlockPassword.value = value;
    },
    updateUnlockRecoveryKey: (value: string) => {
      unlockRecoveryKey.value = value;
    },
    unlockApp,
    useGeneratedPassword,
    useSavedRecoveryKey,
  }),
);

onMounted(async () => {
  await initializeVaultPage();
  updateOnlineStatus();
  window.addEventListener("keydown", handleInternalShortcut);
  window.addEventListener("blur", scheduleAutoLock);
  window.addEventListener("focus", cancelAutoLock);
  window.addEventListener("focus", handleAutoSyncWake);
  window.addEventListener("online", handleAutoSyncWake);
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);
  document.addEventListener("visibilitychange", handleVisibilityAutoLock);
});

async function initializeVaultPage(): Promise<void> {
  initializing.value = true;
  activeModal.value = null;
  if (!vaultStore.hydrated) {
    await vaultStore.hydrate();
  }

  if (vaultStore.storageError) {
    initializing.value = false;
    return;
  }

  deepLinkUnlisten ??= subscribeToDeepLinks(handleDeepLink);
  deepLinkListenerStop = await startDeepLinkListener();
  setI18nLocale(vaultStore.settings.locale);
  if (
    vaultStore.hasUsers &&
    !vaultStore.needsUserSetup &&
    !vaultStore.unlocked
  ) {
    activeModal.value = "lock";
  }
  if (vaultStore.needsUserSetup) {
    resetUserDraft();
    applyWebDeviceBindingIfAvailable();
  }
  initializing.value = false;
  promptServerSignInIfNeeded();
}

onUnmounted(() => {
  window.removeEventListener("keydown", handleInternalShortcut);
  window.removeEventListener("blur", scheduleAutoLock);
  window.removeEventListener("focus", cancelAutoLock);
  window.removeEventListener("focus", handleAutoSyncWake);
  window.removeEventListener("online", handleAutoSyncWake);
  window.removeEventListener("online", updateOnlineStatus);
  window.removeEventListener("offline", updateOnlineStatus);
  document.removeEventListener("visibilitychange", handleVisibilityAutoLock);
  cancelAutoLock();
  cancelAutoSync();
  deepLinkUnlisten?.();
  deepLinkUnlisten = null;
  deepLinkListenerStop?.();
  deepLinkListenerStop = null;
});

watch(
  () => vaultStore.settings.locale,
  (locale) => setI18nLocale(locale),
);

watch(
  filteredItems,
  (items) => {
    if (!vaultStore.query.trim()) return;
    if (items.some((item) => item.id === vaultStore.selectedItemId)) return;
    vaultStore.selectedItemId = items[0]?.id ?? null;
    activeTab.value = "details";
    showSensitive.value = false;
  },
  { flush: "post" },
);

function selectItem(item: VaultItem): void {
  vaultStore.selectItem(item.id);
  showSensitive.value = false;
  activeTab.value = "details";
}

function openQuickSearch(): void {
  quickQuery.value = vaultStore.query;
  activeModal.value = "quick";
}

function resetVaultDraft(): void {
  vaultDraft.name = "";
  vaultDraft.description = "";
  vaultDraft.color = "slate";
  vaultDraft.icon = "folder-lock";
}

function clearSensitiveUiState(): void {
  activeDrawer.value = null;
  activeManagementPage.value = null;
  quickQuery.value = "";
  showSensitive.value = false;
  activeTab.value = "details";
  uploadingFiles.value = false;
  resetItemDraft();
  resetVaultDraft();
  resetUserDraft();
  clearRecoveryReveal();
  sensitiveViewKey.value += 1;
}

function clearRecoveryReveal(): void {
  revealedRecoveryKey.value = "";
  revealError.value = "";
  revealRecoveryKeyIssue.value = "";
  savingRecoveryKeyToDevice.value = false;
}

function openSignOutCurrentUserModal(): void {
  if (!vaultStore.activeUser) return;
  activeModal.value = "removeUser";
}

function requestDeleteVault(vaultId: string): void {
  const vault = vaultStore.vaults.find(
    (candidate) => candidate.id === vaultId && !candidate.sync.deletedAt,
  );
  if (!vault) return;

  pendingDeleteVaultId.value = vaultId;
  activeModal.value = "deleteVaultConfirm";
}

function closeDeleteVaultConfirm(): void {
  if (deletingVault.value) return;
  pendingDeleteVaultId.value = null;
  activeModal.value = null;
}

async function confirmDeleteVault(): Promise<void> {
  const vaultId = pendingDeleteVaultId.value;
  if (!vaultId) return;

  deletingVault.value = true;
  try {
    const result = await vaultStore.deleteVault(vaultId);
    pendingDeleteVaultId.value = null;
    activeModal.value = null;
    showToast(
      t("toast.vaultDeleted", {
        name: result.vaultName,
        count: result.itemCount,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showToast(
      message === "vault-delete-last" ? t("vault.deleteLastBlocked") : message,
    );
  } finally {
    deletingVault.value = false;
  }
}

function openImportFromItemPicker(): void {
  activeModal.value = null;
  void openManagement("backup");
}

async function openManagement(
  page: ManagementPageName = "settings",
): Promise<void> {
  if (page === "backup") {
    await vaultStore.ensureAllVaultObjectsLoaded();
  }
  activeManagementPage.value = page;
  activeDrawer.value = null;
  passwordTargetFieldId.value = null;
}

function closeDrawer(): void {
  activeDrawer.value = null;
  clearPasswordTarget();
  clearRecoveryReveal();
}

async function openRecoveryKeyModal(): Promise<void> {
  activeDrawer.value = null;
  clearRecoveryReveal();
  activeModal.value = "recoveryKey";
  await loadRecoveryKeyForAnotherDevice();
}

function closeRecoveryKeyModal(): void {
  activeModal.value = null;
  clearRecoveryReveal();
}

function openNewVault(): void {
  vaultDraft.name = "";
  vaultDraft.description = "";
  vaultDraft.color = "slate";
  vaultDraft.icon = "folder-lock";
  activeModal.value = "vault";
}

async function saveVault(): Promise<void> {
  const vault = await vaultStore.createVault({
    name: vaultDraft.name,
    description: vaultDraft.description,
    color: vaultDraft.color,
    icon: vaultDraft.icon,
  });

  activeModal.value = null;
  showToast(t("toast.vaultCreated", { name: vault.name }));
}

async function copyValue(
  value: string,
  message = t("toast.copied"),
): Promise<void> {
  try {
    await navigator.clipboard?.writeText(value);
    scheduleClipboardCleanup(value);
  } catch {
    // Clipboard access can be unavailable in browser previews.
  }
  showToast(message);
}

function scheduleClipboardCleanup(value: string): void {
  if (clipboardCleanupTimer !== null) {
    window.clearTimeout(clipboardCleanupTimer);
  }

  clipboardCleanupValue = value;
  clipboardCleanupTimer = window.setTimeout(() => {
    clipboardCleanupTimer = null;
    clipboardCleanupValue = "";
    void clearClipboardIfUnchanged(value);
  }, 45_000);
}

function clearPendingClipboard(): void {
  if (clipboardCleanupTimer !== null) {
    window.clearTimeout(clipboardCleanupTimer);
    clipboardCleanupTimer = null;
  }

  const value = clipboardCleanupValue;
  clipboardCleanupValue = "";
  if (value) void clearClipboardIfUnchanged(value);
}

async function clearClipboardIfUnchanged(value: string): Promise<void> {
  try {
    if ((await navigator.clipboard?.readText()) === value) {
      await navigator.clipboard.writeText("");
    }
  } catch {
    // Some environments allow writes but not reads.
  }
}

function showToast(message: string): void {
  toast.message = message;
  toast.visible = true;
  window.setTimeout(() => {
    toast.visible = false;
  }, 1800);
}

function showOperationProgress(
  progress: Pick<OperationProgressState, "title" | "body">,
): number {
  operationProgressToken += 1;
  operationProgress.title = progress.title;
  operationProgress.body = progress.body;
  operationProgress.visible = true;
  return operationProgressToken;
}

function hideOperationProgress(token = operationProgressToken): void {
  if (token !== operationProgressToken) return;
  operationProgress.visible = false;
  operationProgress.title = "";
  operationProgress.body = "";
}

async function runWithOperationProgress<T>(
  progress: Pick<OperationProgressState, "title" | "body">,
  task: () => Promise<T>,
): Promise<T> {
  const token = showOperationProgress(progress);
  const startedAt = performance.now();
  try {
    return await task();
  } finally {
    const elapsed = performance.now() - startedAt;
    if (elapsed < 450) {
      await new Promise((resolve) => window.setTimeout(resolve, 450 - elapsed));
    }
    hideOperationProgress(token);
  }
}

async function handleDeepLink(url: string): Promise<void> {
  if (!url.startsWith("lockpass://auth/callback")) return;

  try {
    if (vaultStore.needsUserSetup && !vaultStore.activeUser?.crypto) {
      const exchange = vaultStore.parseServerAccountAuthorizationCallback(url);
      pendingServerExchange.value = exchange;
      setupServerMode.value = exchange.mode;
      setupServerUrl.value = exchange.serverUrl;
      setupServerBusy.value = false;
      userSetupInitialMode.value = "restore";
      userDraft.username =
        exchange.account.email ??
        exchange.account.displayName ??
        exchange.account.id;
      vaultStore.clearOfficialLoginState();
      authError.value = "";
      showToast(t("user.serverConnectedToast"));
      return;
    }

    await vaultStore.completeOfficialSyncAuthorization(url);
    activeManagementPage.value = null;
    activeDrawer.value = "sync";
    vaultStore.clearOfficialLoginState();
    showToast(t("sync.connectSuccess"));
    scheduleAutoSync("device-bound", 250);
  } catch (error) {
    setupServerBusy.value = false;
    if (vaultStore.needsUserSetup && !vaultStore.activeUser?.crypto) {
      authError.value = syncErrorToast(error);
      vaultStore.setOfficialLoginError(
        error instanceof Error ? error.message : "syncFailed",
      );
      return;
    }
    activeManagementPage.value = null;
    activeDrawer.value = "sync";
    vaultStore.setOfficialLoginError(
      error instanceof Error ? error.message : "syncFailed",
    );
    showToast(syncErrorToast(error));
  }
}

async function openInitialServerLogin(
  authMode: "login" | "register" = "login",
): Promise<void> {
  if (setupServerBusy.value) return;
  if (setupServerMode.value === "selfhost" && !setupServerUrl.value.trim()) {
    authError.value = t("sync.syncServerRequired");
    return;
  }

  setupServerBusy.value = true;
  authError.value = "";
  try {
    const authorization = vaultStore.startServerAccountAuthorization({
      mode: setupServerMode.value,
      serverUrl: setupServerUrl.value,
      authMode,
    });
    await openExternalUrl(authorization.loginUrl);
    showToast(t("sync.officialLoginPendingBody"));
  } catch (error) {
    authError.value = syncErrorToast(error);
  } finally {
    setupServerBusy.value = false;
  }
}

function syncErrorToast(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  if (
    message === "syncLocked" ||
    message === "syncConnectionInvalid" ||
    message === "syncOfficialAuthorizationMissing" ||
    message === "syncOfficialCallbackMismatch" ||
    message === "syncOfficialDenied" ||
    message === "syncOfficialExpired" ||
    message === "syncNetworkBlocked" ||
    message === "popup_blocked"
  ) {
    return t(`sync.${message}`);
  }
  return t("sync.syncFailed");
}

async function runSidebarSyncNow(): Promise<void> {
  if (!vaultStore.syncConnected) {
    showToast(t("sync.syncNotConnected"));
    return;
  }

  try {
    const result = await runWithOperationProgress(
      { title: t("progress.syncTitle"), body: t("progress.syncBody") },
      () => vaultStore.runSync(),
    );
    const message =
      result.rejectedCodes.length > 0
        ? t("sync.syncRejectedDetails", {
            details: result.rejectedCodes.join("; "),
          })
        : t("sync.syncSuccess", {
            pushed: result.pushed,
            pulled: result.pulled,
            conflicts: result.conflicts,
            rejected: result.rejected,
          });
    showToast(message);
  } catch (error) {
    showToast(syncErrorToast(error));
  }
}

function scheduleAutoSync(reason: string, delayMs = 900): void {
  if (
    !vaultStore.unlocked ||
    !vaultStore.syncConnected ||
    vaultStore.syncConflictCount > 0
  )
    return;
  cancelAutoSync();
  autoSyncTimer = window.setTimeout(() => {
    autoSyncTimer = null;
    void vaultStore.tryAutoSync(reason);
  }, delayMs);
}

function cancelAutoSync(): void {
  if (autoSyncTimer === null) return;
  window.clearTimeout(autoSyncTimer);
  autoSyncTimer = null;
}

function handleAutoSyncWake(): void {
  scheduleAutoSync("wake");
}

function updateOnlineStatus(): void {
  isOnline.value = typeof navigator === "undefined" ? true : navigator.onLine;
}

function promptServerSignInIfNeeded(): void {
  if (
    !vaultStore.hydrated ||
    !vaultStore.unlocked ||
    vaultStore.syncConnected ||
    activeManagementPage.value ||
    activeModal.value
  )
    return;
  activeDrawer.value = "sync";
}

async function lockApp(): Promise<void> {
  if (vaultStore.unlocked) await vaultStore.persist();
  clearPendingClipboard();
  clearSensitiveUiState();
  vaultStore.lock();
  unlockPassword.value = "";
  unlockRecoveryKey.value = "";
  authError.value = "";
  activeModal.value = "lock";
  showToast(t("toast.locked"));
}

async function useSavedRecoveryKey(): Promise<void> {
  const perf = createPerfTrace("unlockWithSavedRecoveryKey");
  authError.value = "";
  unlockRecoveryKey.value = "";

  unlockingVault.value = true;
  await nextFrame();
  try {
    if (!unlockPassword.value) {
      authError.value = t("lock.masterPasswordRequiredForSavedKey");
      perf.done({ status: "password-required" });
      return;
    }

    const sessionUnlock = await perf.measure(
      "store.unlockActiveUserWithSessionCache",
      () => vaultStore.unlockActiveUserWithSessionCache(unlockPassword.value),
    );
    if (sessionUnlock === "unlocked") {
      unlockPassword.value = "";
      activeModal.value = null;
      showToast(t("toast.unlocked"));
      scheduleAutoSync("unlock");
      promptServerSignInIfNeeded();
      perf.done({ status: "session-cache-unlocked" });
      return;
    }
    if (sessionUnlock === "invalid") {
      authError.value = t("user.wrongPassword");
      perf.done({ status: "session-cache-invalid-password" });
      return;
    }

    const result = await perf.measure("secureStorage.loadRecoveryKey", () =>
      vaultStore.loadSavedRecoveryKeyForActiveUser(),
    );
    if (result.status === "loaded") {
      const valid = await perf.measure("store.unlockActiveUser", () =>
        vaultStore.unlockActiveUser(unlockPassword.value, result.recoveryKey),
      );
      if (!valid) {
        authError.value = t("user.wrongUnlockSecret");
        return;
      }

      unlockPassword.value = "";
      activeModal.value = null;
      showToast(t("toast.unlocked"));
      scheduleAutoSync("unlock");
      promptServerSignInIfNeeded();
      perf.done({ status: "unlocked" });
      return;
    }

    authError.value =
      result.status === "unsupported"
        ? t("lock.savedRecoveryKeyUnsupported")
        : t("lock.savedRecoveryKeyMissing");
    perf.done({ status: result.status });
  } catch (error) {
    authError.value = error instanceof Error ? error.message : String(error);
    perf.done({ failed: true, error: authError.value });
  } finally {
    unlockingVault.value = false;
  }
}

async function unlockApp(): Promise<void> {
  const perf = createPerfTrace("unlockWithManualRecoveryKey");
  authError.value = "";
  if (!unlockRecoveryKey.value.trim()) {
    authError.value = t("lock.recoveryKeyRequired");
    return;
  }

  const password = unlockPassword.value;
  const recoveryKey = unlockRecoveryKey.value.trim();
  unlockingVault.value = true;
  await nextFrame();
  try {
    const valid = await perf.measure("store.unlockActiveUser", () =>
      vaultStore.unlockActiveUser(password, recoveryKey),
    );
    if (!valid) {
      authError.value = t("user.wrongUnlockSecret");
      return;
    }

    unlockPassword.value = "";
    unlockRecoveryKey.value = "";
    activeModal.value = null;
    showToast(t("toast.unlocked"));
    scheduleAutoSync("unlock");
    promptServerSignInIfNeeded();
    perf.done({ status: "unlocked", recoveryKeySave: "background" });
    void saveRecoveryKeyAfterManualUnlock(recoveryKey);
  } catch {
    authError.value = t("user.wrongUnlockSecret");
    perf.done({ failed: true });
  } finally {
    unlockingVault.value = false;
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) =>
    window.requestAnimationFrame(() => resolve()),
  );
}

async function saveRecoveryKeyAfterManualUnlock(
  recoveryKey: string,
): Promise<void> {
  const perf = createPerfTrace("saveRecoveryKeyAfterManualUnlock");
  try {
    const storageStatus = await perf.measure(
      "secureStorage.saveRecoveryKey",
      () => vaultStore.saveVerifiedRecoveryKeyForActiveUser(recoveryKey),
    );
    perf.done({ status: storageStatus });
    showToast(
      storageStatus === "saved"
        ? t("toast.recoveryKeySaved")
        : storageStatus === "unsupported"
          ? t("toast.recoveryKeyBrowserPreview")
          : t("toast.recoveryKeySaveFailed"),
    );
  } catch (error) {
    perf.done({
      failed: true,
      error: error instanceof Error ? error.message : String(error),
    });
    showToast(t("toast.recoveryKeySaveFailed"));
  }
}

async function loadRecoveryKeyForAnotherDevice(): Promise<void> {
  revealError.value = "";
  revealedRecoveryKey.value = "";
  revealRecoveryKeyIssue.value = "";

  if (!vaultStore.unlocked) {
    revealError.value = t("settings.recoveryKeyLocked");
    return;
  }
  try {
    const result = await vaultStore.loadSavedRecoveryKeyForActiveUser();
    if (result.status === "loaded") {
      revealedRecoveryKey.value = result.recoveryKey;
      return;
    }

    revealRecoveryKeyIssue.value =
      result.status === "unsupported" ? "unsupported" : "missing";
    revealError.value =
      revealRecoveryKeyIssue.value === "unsupported"
        ? t("settings.recoveryKeyUnsupported")
        : t("settings.recoveryKeyMissing");
  } catch (error) {
    revealError.value = error instanceof Error ? error.message : String(error);
  }
}

async function saveRecoveryKeyToDevice(recoveryKey: string): Promise<void> {
  revealError.value = "";
  revealedRecoveryKey.value = "";

  if (!vaultStore.unlocked) {
    revealRecoveryKeyIssue.value = "";
    revealError.value = t("settings.recoveryKeyLocked");
    return;
  }
  const normalizedRecoveryKey = recoveryKey.trim();
  if (!normalizedRecoveryKey) {
    revealRecoveryKeyIssue.value = "missing";
    revealError.value = t("settings.recoveryKeyBindRequired");
    return;
  }

  savingRecoveryKeyToDevice.value = true;
  try {
    const storageStatus = await vaultStore.saveVerifiedRecoveryKeyForActiveUser(
      normalizedRecoveryKey,
    );
    if (storageStatus === "saved") {
      revealRecoveryKeyIssue.value = "";
      revealedRecoveryKey.value = normalizedRecoveryKey;
      showToast(t("toast.recoveryKeySaved"));
      return;
    }

    revealRecoveryKeyIssue.value =
      storageStatus === "unsupported" ? "unsupported" : "missing";
    revealError.value =
      storageStatus === "unsupported"
        ? t("settings.recoveryKeyUnsupported")
        : t("settings.recoveryKeySaveFailed");
  } catch {
    revealRecoveryKeyIssue.value = "missing";
    revealError.value = t("user.wrongUnlockSecret");
  } finally {
    savingRecoveryKeyToDevice.value = false;
  }
}

async function changeLocale(locale: SupportedLocale): Promise<void> {
  await vaultStore.setLocale(locale);
  setI18nLocale(locale);
  showToast(t("toast.settingsSaved"));
}

async function changeLogLevel(level: DesktopLogLevel): Promise<void> {
  await vaultStore.setLogLevel(level);
  showToast(t("toast.settingsSaved"));
}

async function changeSecuritySettings(
  settings: Partial<DesktopSecuritySettings>,
): Promise<void> {
  await vaultStore.saveSecuritySettings(settings);
  showToast(t("toast.settingsSaved"));
}

async function changeShortcut(payload: {
  scope: ShortcutScope;
  action: ShortcutAction;
  shortcut: string;
}): Promise<void> {
  await vaultStore.setShortcut(payload.scope, payload.action, payload.shortcut);
  showToast(t("toast.settingsSaved"));
}

async function resetShortcuts(): Promise<void> {
  await vaultStore.resetShortcuts();
  showToast(t("shortcuts.defaultsRestored"));
}

async function openDesktopLogDir(): Promise<void> {
  try {
    const path = await openLogDir();
    showToast(
      path
        ? t("settings.openLogDirSuccess")
        : t("settings.openLogDirBrowserPreview"),
    );
  } catch {
    showToast(t("settings.openLogDirFailed"));
  }
}

function selectQuickResult(item: VaultItem): void {
  selectItem(item);
  activeModal.value = null;
  copyValue(
    item.fields.find((field) => field.kind === "password")?.value ?? item.title,
    t("toast.copiedPassword"),
  );
}

function handleInternalShortcut(event: KeyboardEvent): void {
  if (!vaultStore.hydrated || activeManagementPage.value) return;

  const shortcuts = vaultStore.settings.shortcuts.internal;
  if (shortcutMatchesEvent(shortcuts.quickSearch, event)) {
    event.preventDefault();
    openQuickSearch();
    return;
  }
  if (shortcutMatchesEvent(shortcuts.lock, event)) {
    event.preventDefault();
    void lockApp();
    return;
  }
  if (shortcutMatchesEvent(shortcuts.newItem, event)) {
    event.preventDefault();
    openNewItem();
    return;
  }
  if (shortcutMatchesEvent(shortcuts.passwordGenerator, event)) {
    event.preventDefault();
    openStandalonePasswordGenerator();
    return;
  }
  if (shortcutMatchesEvent(shortcuts.settings, event)) {
    event.preventDefault();
    void openManagement("settings");
    return;
  }
  if (shortcutMatchesEvent(shortcuts.syncNow, event)) {
    event.preventDefault();
    void runSidebarSyncNow();
  }
}

function handleVisibilityAutoLock(): void {
  if (document.hidden) {
    scheduleAutoLock();
  } else {
    cancelAutoLock();
  }
}

function scheduleAutoLock(): void {
  cancelAutoLock();
  if (!vaultStore.unlocked || !vaultStore.settings.security.autoLockOnLimit)
    return;
  const delayMs = vaultStore.settings.security.autoLockDelaySeconds * 1000;
  if (delayMs <= 0) return;
  autoLockTimer = window.setTimeout(() => {
    autoLockTimer = null;
    if (vaultStore.unlocked) void lockApp();
  }, delayMs);
}

function cancelAutoLock(): void {
  if (autoLockTimer === null) return;
  window.clearTimeout(autoLockTimer);
  autoLockTimer = null;
}
</script>

<template>
  <DesktopStartupState
    v-if="initializing && !vaultStore.hydrated && !vaultStore.storageError"
    :initializing="initializing"
    storage-error=""
    variant="loading"
  />

  <DesktopStartupState
    v-else-if="vaultStore.storageError && !vaultStore.hydrated"
    :initializing="initializing"
    :storage-error="vaultStore.storageError"
    variant="storageError"
    @retry="initializeVaultPage"
  />

  <div
    v-else
    class="grid h-screen min-h-[680px] grid-rows-[56px_minmax(0,1fr)] bg-[#f7f8fa] text-slate-950"
  >
    <DesktopHeader
      @quick-search="openQuickSearch"
      @open-generator="openStandalonePasswordGenerator"
      @new-item="openNewItem()"
      @lock="lockApp"
    />

    <DesktopVaultWorkspace ref="workspaceRef" />

    <DesktopVaultModalLayer />
  </div>
</template>
