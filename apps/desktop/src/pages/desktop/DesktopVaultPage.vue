<script setup lang="ts">
import {
  generatePassword,
  type VaultItem,
  type VaultItemField,
  type VaultItemType,
} from "@lockpass/core";
import { RefreshCw, TriangleAlert } from "@lucide/vue";
import { storeToRefs } from "pinia";
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { setI18nLocale, type SupportedLocale } from "@/i18n";
import {
  assertBackupPackage,
  backupFileName,
  csvFileName,
  downloadTextFile,
  openSavedFileDirectory,
  parseCsvImport,
  readLegacyLockPassBackup,
  type ExternalImportItem,
  type ExternalImportVault,
  type ImportFieldLabelMap,
  type TextFileSaveResult,
} from "@/services/backup";
import {
  startDeepLinkListener,
  subscribeToDeepLinks,
} from "@/services/deepLink";
import { openLogDir } from "@/services/logger";
import { generateRecoveryKey } from "@/services/masterPassword";
import { createPerfTrace } from "@/services/perfTrace";
import { isUserWebRuntime } from "@/services/runtime";
import type { SyncMode } from "@/services/syncClient";
import { shortcutMatchesEvent } from "@/services/shortcuts";
import {
  openExternalUrl,
  saveAttachmentFile,
  type DesktopLogLevel,
  type DesktopSecuritySettings,
  type ShortcutAction,
  type ShortcutScope,
} from "@/services/vaultRepository";
import { loadWebDeviceBinding } from "@/services/webDeviceBinding";
import {
  useVaultStore,
  type PendingSyncDeviceBindExchange,
} from "@/stores/vault";
import BackupSavedModal from "./components/BackupSavedModal.vue";
import DeleteVaultConfirmModal from "./components/DeleteVaultConfirmModal.vue";
import DesktopDrawer from "./components/DesktopDrawer.vue";
import DesktopHeader from "./components/DesktopHeader.vue";
import ItemDetailPane from "./components/ItemDetailPane.vue";
import ItemEditorModal from "./components/ItemEditorModal.vue";
import ItemListPane from "./components/ItemListPane.vue";
import LockOverlay from "./components/LockOverlay.vue";
import ManagementPage from "./components/ManagementPage.vue";
import ProgressModal from "./components/ProgressModal.vue";
import QuickSearchModal from "./components/QuickSearchModal.vue";
import RemoveUserModal from "./components/RemoveUserModal.vue";
import RecoveryKeyModal from "./components/RecoveryKeyModal.vue";
import ResizeHandle from "./components/ResizeHandle.vue";
import SwitchUserConfirmModal from "./components/SwitchUserConfirmModal.vue";
import ToastNotice from "./components/ToastNotice.vue";
import UserManagementModal from "./components/UserManagementModal.vue";
import UserSetupModal from "./components/UserSetupModal.vue";
import VaultModal from "./components/VaultModal.vue";
import VaultSidebar from "./components/VaultSidebar.vue";
import {
  defaultFields,
  detailFields,
  getInitials,
  makeField,
} from "./formatters";
import type {
  DetailTab,
  DrawerName,
  ItemDraft,
  ManagementPageName,
  ModalName,
  OperationProgressState,
  PasswordOptions,
  ToastState,
  UserDraft,
  VaultDraft,
} from "./types";
import { useColumnResize } from "./useColumnResize";

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

const mainGrid = ref<HTMLElement | null>(null);
const activeTab = ref<DetailTab>("details");
const showSensitive = ref(false);
const activeDrawer = ref<DrawerName>(null);
const activeManagementPage = ref<ManagementPageName | null>(null);
const activeModal = ref<ModalName>(null);
const editingItemId = ref<string | null>(null);
const passwordTargetFieldId = ref<string | null>(null);
const quickQuery = ref("");
const uploadingFiles = ref(false);
const itemError = ref("");
const authError = ref("");
const unlockPassword = ref("");
const unlockRecoveryKey = ref("");
const unlockingVault = ref(false);
const creatingUser = ref(false);
const generatedRecoveryKey = ref("");
const recoveryUserName = ref("");
const userSetupInitialMode = ref<"choice" | "new" | "restore">("choice");
const setupServerMode = ref<SyncMode>("official");
const setupServerUrl = ref(vaultStore.settings.sync.serverUrl);
const setupServerBusy = ref(false);
const pendingServerExchange = ref<PendingSyncDeviceBindExchange | null>(null);
const revealedRecoveryKey = ref("");
const revealError = ref("");
const revealRecoveryKeyIssue = ref<"missing" | "unsupported" | "">("");
const savingRecoveryKeyToDevice = ref(false);
const signingOutCurrentUser = ref(false);
const pendingSwitchUserId = ref<string | null>(null);
const pendingDeleteVaultId = ref<string | null>(null);
const deletingVault = ref(false);
const sensitiveViewKey = ref(0);
const backupBusy = ref(false);
const savedBackupResult = ref<TextFileSaveResult | null>(null);
const initializing = ref(true);
let clipboardCleanupTimer: number | null = null;
let clipboardCleanupValue = "";
let deepLinkUnlisten: (() => void) | null = null;
let deepLinkListenerStop: (() => void) | null = null;
let autoLockTimer: number | null = null;
let autoSyncTimer: number | null = null;

const passwordOptions = reactive<PasswordOptions>({
  length: 18,
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: false,
});

const generatedPassword = ref(generatePassword(passwordOptions));
const toast = reactive<ToastState>({ visible: false, message: "" });
const operationProgress = reactive<OperationProgressState>({
  visible: false,
  title: "",
  body: "",
});
let operationProgressToken = 0;

const itemDraft = reactive<ItemDraft>({
  type: "login",
  vaultId: "",
  title: "",
  notes: "",
  fields: [],
  attachments: [],
});

const vaultDraft = reactive<VaultDraft>({
  name: "",
  description: "",
  color: "slate",
  icon: "folder-lock",
});

const userDraft = reactive<UserDraft>({
  username: "",
  password: "",
  confirmPassword: "",
});

const {
  mainGridStyle,
  resizingTarget,
  startColumnResize,
  onResizeHandleKeydown,
} = useColumnResize(vaultStore, mainGrid);

const activeUserName = computed(() => vaultStore.activeUser?.displayName ?? "");
const activeUserInitials = computed(() => getInitials(activeUserName.value));
const hasLegacyImport = computed(
  () => Object.keys(vaultStore.legacyPayloads).length > 0,
);
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
const pendingSwitchUserName = computed(() => {
  return (
    vaultStore.users.find((user) => user.id === pendingSwitchUserId.value)
      ?.displayName ?? ""
  );
});
const setupRequiresServerLogin = computed(() => {
  return (
    vaultStore.hydrated &&
    (vaultStore.needsUserSetup || activeModal.value === "user") &&
    !pendingServerExchange.value &&
    !generatedRecoveryKey.value
  );
});
const setupServerAccountFlow = computed(
  () => setupRequiresServerLogin.value || Boolean(pendingServerExchange.value),
);
const setupServerConnected = computed(
  () => Boolean(pendingServerExchange.value) || !setupRequiresServerLogin.value,
);
const setupServerAccountLabel = computed(() => {
  const exchange = pendingServerExchange.value;
  return exchange?.account.email ?? exchange?.account.displayName ?? "";
});

onMounted(async () => {
  await initializeVaultPage();
  window.addEventListener("keydown", handleInternalShortcut);
  window.addEventListener("blur", scheduleAutoLock);
  window.addEventListener("focus", cancelAutoLock);
  window.addEventListener("focus", handleAutoSyncWake);
  window.addEventListener("online", handleAutoSyncWake);
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

function resetUserDraft(): void {
  userDraft.username = "";
  userDraft.password = "";
  userDraft.confirmPassword = "";
  authError.value = "";
  generatedRecoveryKey.value = "";
  recoveryUserName.value = "";
  if (!vaultStore.needsUserSetup) {
    pendingServerExchange.value = null;
  }
  setupServerMode.value = vaultStore.settings.sync.mode;
  setupServerUrl.value = vaultStore.settings.sync.serverUrl;
  setupServerBusy.value = false;
}

function applyWebDeviceBindingIfAvailable(): void {
  if (!isUserWebRuntime()) return;
  const exchange = loadWebDeviceBinding();
  if (!exchange) return;
  pendingServerExchange.value = exchange;
  setupServerMode.value = exchange.mode;
  setupServerUrl.value = exchange.serverUrl;
  userDraft.username =
    exchange.account.email ??
    exchange.account.displayName ??
    exchange.account.id;
  authError.value = "";
}

function resetItemDraft(): void {
  editingItemId.value = null;
  passwordTargetFieldId.value = null;
  itemError.value = "";
  itemDraft.type = "login";
  itemDraft.vaultId = "";
  itemDraft.title = "";
  itemDraft.notes = "";
  itemDraft.fields = [];
  itemDraft.attachments = [];
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

function closeSwitchUserConfirm(): void {
  pendingSwitchUserId.value = null;
  activeModal.value = null;
}

function openUserManagement(): void {
  activeModal.value = "userManagement";
}

function openAddUser(
  initialMode: "choice" | "new" | "restore" = "choice",
): void {
  resetUserDraft();
  userSetupInitialMode.value = initialMode;
  activeModal.value = "user";
}

function createNewUserFromLock(): void {
  unlockPassword.value = "";
  unlockRecoveryKey.value = "";
  authError.value = "";
  openAddUser("new");
}

function closeUserSetup(): void {
  activeModal.value = null;
  resetUserDraft();
}

function validateUserDraft(): string {
  if (!setupServerAccountFlow.value && !userDraft.username.trim()) {
    return t("user.usernameRequired");
  }
  if (userDraft.password.length < 8) {
    return t("user.passwordTooShort");
  }
  if (userDraft.password !== userDraft.confirmPassword) {
    return t("user.passwordMismatch");
  }

  return "";
}

function prepareUserRecoveryKey(): void {
  const validationError = validateUserDraft();
  authError.value = validationError;
  if (validationError) {
    return;
  }

  generatedRecoveryKey.value = generateRecoveryKey();
  recoveryUserName.value =
    userDraft.username.trim() ||
    setupServerAccountLabel.value ||
    t("user.currentUser");
}

function backToUserDraftFromRecoveryKey(): void {
  authError.value = "";
  generatedRecoveryKey.value = "";
  recoveryUserName.value = "";
  userSetupInitialMode.value = "new";
}

async function restoreExistingServerAccount(payload: {
  password: string;
  recoveryKey: string;
}): Promise<void> {
  if (!pendingServerExchange.value) {
    authError.value = t("sync.syncOfficialAuthorizationMissing");
    return;
  }
  creatingUser.value = true;
  authError.value = "";
  try {
    await vaultStore.restoreServerAccount({
      exchange: pendingServerExchange.value,
      password: payload.password,
      recoveryKey: payload.recoveryKey,
    });
    pendingServerExchange.value = null;
    closeUserSetup();
    showToast(t("toast.unlocked"));
    scheduleAutoSync("restore-server-account");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    authError.value =
      message === "serverVaultKeyMissing"
        ? t("user.serverVaultKeyMissing")
        : message === "duplicate-username"
          ? t("user.duplicateUsername")
          : t("user.wrongUnlockSecret");
  } finally {
    creatingUser.value = false;
  }
}

function showUnavailableRecoveryQr(): void {
  showToast(t("user.restoreQrUnavailable"));
}

async function createUser(): Promise<void> {
  const validationError = validateUserDraft();
  authError.value = validationError;
  if (validationError) {
    generatedRecoveryKey.value = "";
    userSetupInitialMode.value = "new";
    return;
  }
  if (!generatedRecoveryKey.value) {
    prepareUserRecoveryKey();
    return;
  }

  creatingUser.value = true;
  try {
    const result = await vaultStore.createUser({
      username:
        userDraft.username.trim() ||
        setupServerAccountLabel.value ||
        "server-user",
      password: userDraft.password,
      recoveryKey: generatedRecoveryKey.value,
      sync: {
        mode: setupServerMode.value,
        serverUrl: setupServerUrl.value,
      },
    });
    if (pendingServerExchange.value) {
      await vaultStore.applyPendingServerAccountExchange(
        pendingServerExchange.value,
      );
      pendingServerExchange.value = null;
    }
    const toastMessage =
      result.recoveryKeyStorage === "unsupported"
        ? t("toast.recoveryKeyBrowserPreview")
        : result.recoveryKeyStorage === "saved"
          ? t("toast.recoveryKeySaved")
          : t("toast.recoveryKeySaveFailed");
    closeUserSetup();
    showToast(toastMessage);
    promptServerSignInIfNeeded();
  } catch (error) {
    authError.value =
      error instanceof Error && error.message === "duplicate-username"
        ? t("user.duplicateUsername")
        : error instanceof Error
          ? error.message
          : String(error);
  } finally {
    creatingUser.value = false;
  }
}

async function switchUser(userId: string): Promise<void> {
  authError.value = "";
  unlockPassword.value = "";
  unlockRecoveryKey.value = "";
  pendingSwitchUserId.value = null;
  clearPendingClipboard();
  clearSensitiveUiState();
  await vaultStore.switchUser(userId);
  activeDrawer.value = null;
  activeModal.value = vaultStore.needsUserSetup ? null : "lock";
}

function requestSwitchUser(userId: string): void {
  if (!userId || userId === vaultStore.activeUserId) {
    return;
  }

  pendingSwitchUserId.value = userId;
  activeModal.value = "switchUserConfirm";
}

async function confirmSwitchUser(): Promise<void> {
  const userId = pendingSwitchUserId.value;
  if (!userId) return;
  await switchUser(userId);
}

function openAddUserFromManagement(): void {
  openAddUser();
}

async function signOutCurrentUser(payload: {
  deleteLocalData: boolean;
}): Promise<void> {
  signingOutCurrentUser.value = true;
  const userName = activeUserName.value;
  try {
    if (payload.deleteLocalData) {
      const removed = await vaultStore.removeActiveUserFromDevice();
      clearPendingClipboard();
      clearSensitiveUiState();
      activeDrawer.value = null;
      activeModal.value = vaultStore.needsUserSetup ? null : "lock";
      if (removed) {
        showToast(
          t("toast.userRemovedFromDevice", { name: removed.displayName }),
        );
      }
      return;
    }

    if (vaultStore.unlocked) await vaultStore.persist();
    clearPendingClipboard();
    clearSensitiveUiState();
    vaultStore.lock();
    unlockPassword.value = "";
    unlockRecoveryKey.value = "";
    authError.value = "";
    activeDrawer.value = null;
    activeModal.value = "lock";
    showToast(t("toast.userSignedOut", { name: userName }));
  } catch (error) {
    showToast(error instanceof Error ? error.message : String(error));
  } finally {
    signingOutCurrentUser.value = false;
  }
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

function openNewItem(type: VaultItemType = "login"): void {
  editingItemId.value = null;
  itemError.value = "";
  itemDraft.type = type;
  itemDraft.vaultId =
    vaultStore.selectedVaultId === "all"
      ? (writableVaults.value[0]?.id ?? "")
      : vaultStore.selectedVaultId;
  itemDraft.title = "";
  itemDraft.notes = "";
  itemDraft.fields = defaultFields(t, type);
  itemDraft.attachments = [];
  activeModal.value = "item";
}

function openEditItem(): void {
  const item = selectedItem.value;
  if (!item) return;

  itemError.value = "";
  editingItemId.value = item.id;
  itemDraft.type = item.type;
  itemDraft.vaultId = item.vaultId;
  itemDraft.title = item.title;
  itemDraft.notes =
    item.notes ||
    item.fields.find((field) => field.kind === "note")?.value ||
    "";
  itemDraft.fields = detailFields(t, item).map((field) => ({ ...field }));
  itemDraft.attachments = selectedItemAttachments.value.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    checksumSha256: attachment.checksumSha256,
    encryptedBlobRef: attachment.encryptedBlobRef,
    state: attachment.state,
  }));
  activeModal.value = "item";
}

function changeDraftType(type: VaultItemType): void {
  itemError.value = "";
  itemDraft.type = type;
  if (!editingItemId.value) {
    itemDraft.title = "";
  }
  itemDraft.fields = defaultFields(t, type);
}

function addTotpField(): void {
  if (itemDraft.type !== "login") return;
  if (itemDraft.fields.some((field) => field.kind === "totp")) return;

  itemDraft.fields = [...itemDraft.fields, makeField(t, "totp", "", true)];
}

function openPasswordGenerator(target: VaultItemField): void {
  passwordTargetFieldId.value = target.id;
  generatedPassword.value = generatePassword(passwordOptions);
  activeDrawer.value = "generator";
}

function openStandalonePasswordGenerator(): void {
  passwordTargetFieldId.value = null;
  activeDrawer.value = "generator";
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
  passwordTargetFieldId.value = null;
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

function useGeneratedPassword(): void {
  const targetId = passwordTargetFieldId.value;
  if (!targetId) return;

  const target = itemDraft.fields.find((field) => field.id === targetId);
  if (target) target.value = generatedPassword.value;
  closeDrawer();
}

function removeDraftField(id: string): void {
  itemDraft.fields = itemDraft.fields.filter((field) => field.id !== id);
}

async function saveItem(): Promise<void> {
  const validationError = validateItemDraft();
  if (validationError) {
    itemError.value = validationError;
    return;
  }

  const isEditing = editingItemId.value !== null;
  const saved = await vaultStore.saveItem({
    editingItemId: editingItemId.value,
    type: itemDraft.type,
    vaultId: itemDraft.vaultId,
    title: itemDraft.title,
    notes: itemDraft.notes,
    fields: itemDraft.fields,
    attachments: itemDraft.attachments,
  });

  activeModal.value = null;
  editingItemId.value = null;
  itemError.value = "";
  showToast(t(isEditing ? "toast.itemUpdated" : "toast.itemCreated"));
  vaultStore.selectItem(saved.id);
}

function validateItemDraft(): string {
  if (!itemDraft.vaultId || !itemDraft.title.trim())
    return t("editor.requiredMissing");

  if (itemDraft.type === "login" && !fieldValue("password"))
    return t("editor.requiredMissing");
  if (itemDraft.type === "payment-card" && !fieldValue("card-number"))
    return t("editor.requiredMissing");
  if (itemDraft.type === "secure-note" && !itemDraft.notes.trim())
    return t("editor.requiredMissing");
  return "";
}

function fieldValue(kind: VaultItemField["kind"]): string {
  return (
    itemDraft.fields.find((field) => field.kind === kind)?.value.trim() ?? ""
  );
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

async function onFilesSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  if (files.length === 0) return;

  uploadingFiles.value = true;
  try {
    const sessionKey = vaultStore.requireVaultKey();
    const activeUserId = vaultStore.activeUserId;
    if (!activeUserId) throw new Error("active-user-required");
    const drafts = await Promise.all(
      files.map(async (file) => {
        const id = `attachment-${crypto.randomUUID()}`;
        const saved = await saveAttachmentFile(
          activeUserId,
          id,
          file,
          sessionKey.vaultKey,
          sessionKey.keyId,
        );
        return {
          id,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          checksumSha256: saved.checksumSha256,
          encryptedBlobRef: saved.encryptedBlobRef,
          state: "available" as const,
          previewFile: file,
        };
      }),
    );

    itemDraft.attachments = [...itemDraft.attachments, ...drafts];
    showToast(t("toast.filesSelected", { count: drafts.length }));
  } finally {
    input.value = "";
    uploadingFiles.value = false;
  }
}

async function createBackup(): Promise<void> {
  await runBackupTask(
    {
      title: t("progress.backupExportTitle"),
      body: t("progress.backupExportBody"),
    },
    async () => {
      const backup = await vaultStore.exportBackupPackage();
      const result = await downloadTextFile(
        backupFileName(),
        JSON.stringify(backup, null, 2),
      );
      savedBackupResult.value = result;
    },
  );
}

async function restoreBackup(file: File): Promise<void> {
  await runBackupTask(
    {
      title: t("progress.backupRestoreTitle"),
      body: t("progress.backupRestoreBody"),
    },
    async () => {
      const backup = assertBackupPackage(JSON.parse(await file.text()));
      await vaultStore.restoreBackupPackage(backup);
      activeManagementPage.value = null;
      activeModal.value = "lock";
      showToast(t("backup.restoreSuccess"));
    },
  );
}

async function importCsv(file: File): Promise<void> {
  await runBackupTask(
    { title: t("progress.csvImportTitle"), body: t("progress.csvImportBody") },
    async () => {
      const items = parseCsvImport(await file.text(), importFieldLabels());
      const result = await importExternalItems(items, t("backup.csvVaultName"));
      showToast(
        t("backup.importSuccess", {
          count: result.imported,
          vault: result.vaultName,
        }),
      );
    },
  );
}

async function exportCsv(): Promise<void> {
  await runBackupTask(
    { title: t("progress.csvExportTitle"), body: t("progress.csvExportBody") },
    async () => {
      const result = await downloadTextFile(
        csvFileName(),
        await vaultStore.exportCsvText(),
        "text/csv",
      );
      showToast(textFileSavedToast("backup.csvExportSuccess", result));
    },
  );
}

async function importLegacyBackup(payload: {
  file: File;
  password: string;
}): Promise<void> {
  await runBackupTask(
    {
      title: t("progress.legacyImportTitle"),
      body: t("progress.legacyImportBody"),
    },
    async () => {
      const result = await readLegacyLockPassBackup(
        payload.file,
        payload.password,
        importFieldLabels(),
        t("backup.legacyVaultName"),
      );
      const imported = await importExternalVaults(
        result.vaults,
        t("backup.legacyVaultName"),
      );
      showToast(
        t("backup.legacyImportSuccess", {
          count: imported.imported,
          vaults: imported.vaults,
        }),
      );
    },
  );
}

async function importExternalItems(
  items: ExternalImportItem[],
  vaultName: string,
): Promise<{ imported: number; vaultName: string }> {
  if (!vaultStore.unlocked) throw new Error("syncLocked");
  const result = await vaultStore.importExternalItems(items, vaultName);
  if (result.imported === 0) throw new Error("backup-empty-import");
  return { imported: result.imported, vaultName: result.vaultName };
}

async function importExternalVaults(
  vaults: ExternalImportVault[],
  fallbackVaultName: string,
): Promise<{ imported: number; vaults: number }> {
  if (!vaultStore.unlocked) throw new Error("syncLocked");
  const result = await vaultStore.importExternalVaults(
    vaults,
    fallbackVaultName,
  );
  if (result.imported === 0 && result.vaults === 0)
    throw new Error("backup-empty-import");
  return { imported: result.imported, vaults: result.vaults };
}

async function runBackupTask(
  progress: Pick<OperationProgressState, "title" | "body">,
  task: () => Promise<void>,
): Promise<void> {
  if (backupBusy.value) return;
  backupBusy.value = true;
  try {
    await runWithOperationProgress(progress, task);
  } catch (error) {
    showToast(backupErrorToast(error));
  } finally {
    backupBusy.value = false;
  }
}

function backupErrorToast(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (message === "syncLocked") return t("backup.unlockRequired");
  if (message === "invalid-backup-file") return t("backup.invalidBackup");
  if (message === "legacy-password-invalid")
    return t("backup.legacyPasswordInvalid");
  if (message === "backup-empty-import") return t("backup.emptyImport");
  return message || t("backup.failed");
}

function textFileSavedToast(
  messageKey: "backup.exportSuccess" | "backup.csvExportSuccess",
  result: TextFileSaveResult,
): string {
  if (result.target === "tauri") {
    return t("backup.exportSavedTo", { path: result.path });
  }
  return t("backup.exportDownloadedToBrowser", {
    fileName: result.fileName,
    message: t(messageKey),
  });
}

async function copySavedBackupPath(path: string): Promise<void> {
  await copyValue(path, t("backup.pathCopied"));
}

async function openSavedBackupDirectory(path: string): Promise<void> {
  try {
    const opened = await openSavedFileDirectory(path);
    showToast(
      opened
        ? t("backup.directoryOpened")
        : t("backup.browserDirectoryOpenUnsupported"),
    );
  } catch (error) {
    showToast(
      error instanceof Error ? error.message : t("backup.directoryOpenFailed"),
    );
  }
}

function importFieldLabels(): ImportFieldLabelMap {
  return {
    username: t("fields.username"),
    password: t("fields.password"),
    url: t("fields.url"),
    note: t("fields.note"),
    cardholder: t("fields.cardholder"),
    cardNumber: t("fields.cardNumber"),
    expiry: t("fields.expiry"),
    cvv: t("fields.cvv"),
  };
}

function removeDraftAttachment(id: string): void {
  itemDraft.attachments = itemDraft.attachments.filter(
    (attachment) => attachment.id !== id,
  );
}

function regeneratePassword(): void {
  generatedPassword.value = generatePassword(passwordOptions);
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

function updateSetupServerMode(mode: SyncMode): void {
  setupServerMode.value = mode;
  authError.value = "";
  if (mode === "selfhost") {
    setupServerUrl.value = "";
  }
}

async function updateSetupServerUrl(serverUrl: string): Promise<void> {
  setupServerUrl.value = serverUrl;
  authError.value = "";
  if (!vaultStore.hasUsers) {
    try {
      await vaultStore.saveSyncSettings({
        mode: setupServerMode.value,
        serverUrl,
      });
    } catch (error) {
      authError.value = syncErrorToast(error);
    }
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
  <div
    v-if="initializing && !vaultStore.hydrated && !vaultStore.storageError"
    class="grid h-screen min-h-[560px] place-items-center bg-[#f7f8fa] p-6 text-slate-950"
  >
    <div
      class="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
    >
      <RefreshCw class="size-4 animate-spin" />
      {{ t("app.loading") }}
    </div>
  </div>

  <div
    v-else-if="vaultStore.storageError && !vaultStore.hydrated"
    class="grid h-screen min-h-[560px] place-items-center bg-[#f7f8fa] p-6 text-slate-950"
  >
    <section
      class="grid w-full max-w-xl gap-5 rounded-lg border border-rose-200 bg-white p-6 shadow-xl shadow-rose-950/5"
    >
      <span
        class="grid size-12 place-items-center rounded-lg bg-rose-50 text-rose-700"
      >
        <TriangleAlert class="size-6" />
      </span>
      <div class="grid gap-2">
        <h1 class="text-2xl font-black">{{ t("app.storageError") }}</h1>
        <p class="text-sm leading-6 text-slate-600">
          {{ t("app.storageErrorBody") }}
        </p>
      </div>
      <div
        class="grid gap-1 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2"
      >
        <span class="text-xs font-bold text-rose-700">{{
          t("app.storageErrorDetail")
        }}</span>
        <code class="break-words font-mono text-xs text-rose-900">{{
          vaultStore.storageError
        }}</code>
      </div>
      <button
        class="primary-button justify-self-start"
        type="button"
        :disabled="initializing"
        @click="initializeVaultPage"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': initializing }" />
        {{ initializing ? t("app.loading") : t("app.retry") }}
      </button>
    </section>
  </div>

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

    <main
      ref="mainGrid"
      class="grid min-h-0"
      :style="activeManagementPage ? undefined : mainGridStyle"
    >
      <ManagementPage
        v-if="activeManagementPage"
        :active-page="activeManagementPage"
        :backup-busy="backupBusy"
        @close="activeManagementPage = null"
        @update-page="activeManagementPage = $event"
        @copy-value="copyValue"
        @change-locale="changeLocale"
        @change-log-level="changeLogLevel"
        @change-security-settings="changeSecuritySettings"
        @change-shortcut="changeShortcut"
        @reset-shortcuts="resetShortcuts"
        @open-log-dir="openDesktopLogDir"
        @system-toast="showToast"
        @create-backup="createBackup"
        @restore-backup="restoreBackup"
        @import-csv="importCsv"
        @export-csv="exportCsv"
        @import-legacy-backup="importLegacyBackup"
        @not-ready="showToast(t('toast.notReady'))"
      />

      <template v-else>
        <VaultSidebar
          :active-user-name="activeUserName"
          :active-user-initials="activeUserInitials"
          @create-vault="openNewVault"
          @delete-vault="requestDeleteVault"
          @manage-users="openUserManagement"
          @open-management="openManagement"
          @show-recovery-key="openRecoveryKeyModal"
          @sign-out-current-user="openSignOutCurrentUserModal"
          @lock="lockApp"
        />

        <ResizeHandle
          :active="resizingTarget === 'sidebar'"
          :label="t('layout.resizeSidebar')"
          target="sidebar"
          @resize-keydown="onResizeHandleKeydown"
          @resize-start="startColumnResize"
        />

        <ItemListPane
          :items="filteredItems"
          :selected-item="selectedItem"
          :has-items="visibleItems.length > 0"
          @select-item="selectItem"
          @create-item="openNewItem()"
          @import-csv="openManagement('backup')"
        />

        <ResizeHandle
          :active="resizingTarget === 'itemList'"
          :label="t('layout.resizeItemList')"
          target="itemList"
          @resize-keydown="onResizeHandleKeydown"
          @resize-start="startColumnResize"
        />

        <ItemDetailPane
          :key="sensitiveViewKey"
          v-model:active-tab="activeTab"
          v-model:show-sensitive="showSensitive"
          :selected-item="selectedItem"
          :attachments="selectedItemAttachments"
          :vault-key="vaultStore.vaultKey"
          :key-id="vaultStore.activeKeyId"
          @edit="openEditItem"
          @copy-value="copyValue"
          @security-check="showToast(t('toast.securityChecked'))"
        />
      </template>
    </main>

    <DesktopDrawer
      v-if="activeDrawer"
      :active-drawer="activeDrawer"
      :generated-password="generatedPassword"
      :password-options="passwordOptions"
      :can-use-password="passwordTargetFieldId !== null"
      @close="closeDrawer"
      @copy-value="copyValue"
      @regenerate="regeneratePassword()"
      @use-password="useGeneratedPassword"
      @sync-toast="showToast"
      @operation-start="showOperationProgress"
      @operation-end="hideOperationProgress"
    />

    <ItemEditorModal
      v-if="activeModal === 'item'"
      :editing-item-id="editingItemId"
      :draft="itemDraft"
      :writable-vaults="writableVaults"
      :uploading-files="uploadingFiles"
      :error="itemError"
      :vault-key="vaultStore.vaultKey"
      :key-id="vaultStore.activeKeyId"
      @close="activeModal = null"
      @save="saveItem"
      @change-type="changeDraftType"
      @files-selected="onFilesSelected"
      @remove-attachment="removeDraftAttachment"
      @remove-field="removeDraftField"
      @generate-field="openPasswordGenerator"
      @add-totp="addTotpField"
    />

    <VaultModal
      v-if="activeModal === 'vault'"
      :draft="vaultDraft"
      @close="activeModal = null"
      @save="saveVault"
    />

    <UserSetupModal
      v-if="
        (vaultStore.hydrated && vaultStore.needsUserSetup) ||
        activeModal === 'user' ||
        generatedRecoveryKey
      "
      :draft="userDraft"
      :auth-error="authError"
      :creating="creatingUser"
      :is-adding="activeModal === 'user' && !generatedRecoveryKey"
      :is-legacy-import="hasLegacyImport"
      :recovery-key="generatedRecoveryKey"
      :created-user-name="recoveryUserName"
      :initial-mode="userSetupInitialMode"
      :server-first="setupServerAccountFlow"
      :server-connected="setupServerConnected"
      :server-account-label="setupServerAccountLabel"
      :server-mode="setupServerMode"
      :server-url="setupServerUrl"
      :server-busy="setupServerBusy"
      @close="closeUserSetup"
      @generate-recovery-key="prepareUserRecoveryKey"
      @back-to-new-user="backToUserDraftFromRecoveryKey"
      @restore-existing="restoreExistingServerAccount"
      @scan-recovery-qr="showUnavailableRecoveryQr"
      @submit="createUser"
      @update-server-mode="updateSetupServerMode"
      @update-server-url="updateSetupServerUrl"
      @open-server-login="openInitialServerLogin"
    />

    <QuickSearchModal
      v-if="activeModal === 'quick'"
      v-model:query="quickQuery"
      :items="visibleItems"
      :attachments="visibleAttachments"
      @close="activeModal = null"
      @select-and-copy="selectQuickResult"
    />

    <UserManagementModal
      v-if="activeModal === 'userManagement'"
      @close="activeModal = null"
      @switch-user="requestSwitchUser"
      @add-user="openAddUserFromManagement"
    />

    <RecoveryKeyModal
      v-if="activeModal === 'recoveryKey'"
      :revealed-recovery-key="revealedRecoveryKey"
      :reveal-error="revealError"
      :reveal-issue="revealRecoveryKeyIssue"
      :saving-to-device="savingRecoveryKeyToDevice"
      @close="closeRecoveryKeyModal"
      @copy-value="copyValue"
      @save-recovery-key-to-device="saveRecoveryKeyToDevice"
    />

    <RemoveUserModal
      v-if="activeModal === 'removeUser'"
      :user-name="activeUserName"
      :busy="signingOutCurrentUser"
      @close="activeModal = null"
      @confirm="signOutCurrentUser"
    />

    <SwitchUserConfirmModal
      v-if="activeModal === 'switchUserConfirm'"
      :from-user-name="activeUserName"
      :to-user-name="pendingSwitchUserName"
      @close="closeSwitchUserConfirm"
      @confirm="confirmSwitchUser"
    />

    <DeleteVaultConfirmModal
      v-if="activeModal === 'deleteVaultConfirm' && pendingDeleteVault"
      :vault-name="pendingDeleteVault.name"
      :item-count="pendingDeleteVaultItemCount"
      :deleting="deletingVault"
      @close="closeDeleteVaultConfirm"
      @confirm="confirmDeleteVault"
    />

    <LockOverlay
      v-if="
        activeModal === 'lock' ||
        (!activeModal &&
          vaultStore.hydrated &&
          vaultStore.hasUsers &&
          !vaultStore.needsUserSetup &&
          !vaultStore.unlocked)
      "
      v-model:password="unlockPassword"
      v-model:recovery-key="unlockRecoveryKey"
      :active-user-name="activeUserName"
      :active-user-initials="activeUserInitials"
      :auth-error="authError"
      :unlocking="unlockingVault"
      @unlock="unlockApp"
      @use-saved-recovery-key="useSavedRecoveryKey"
      @create-new-user="createNewUserFromLock"
      @clear-auth-error="authError = ''"
      @switch-user="switchUser"
    />

    <ProgressModal
      :visible="operationProgress.visible"
      :title="operationProgress.title"
      :body="operationProgress.body"
    />
    <BackupSavedModal
      v-if="savedBackupResult"
      :result="savedBackupResult"
      @close="savedBackupResult = null"
      @copy-path="copySavedBackupPath"
      @open-directory="openSavedBackupDirectory"
    />
    <ToastNotice :visible="toast.visible" :message="toast.message" />
  </div>
</template>
