import { computed, reactive, ref, type Ref } from "vue";
import type { SyncMode } from "@/services/syncClient";
import { generateSecretKey } from "@/services/masterPassword";
import { isUserWebRuntime } from "@/services/runtime";
import { loadWebDeviceBinding } from "@/services/webDeviceBinding";
import type {
  PendingSyncDeviceBindExchange,
  SyncConnectPayload,
} from "@/stores/vault/types";
import type { ModalName, UserDraft } from "./types";

type Translate = (key: string, params?: Record<string, unknown>) => string;

interface UserSessionStore {
  activeUser: { displayName: string } | null;
  activeUserId: string | null;
  hasUsers: boolean;
  legacyPayloads: Record<string, unknown>;
  needsUserSetup: boolean;
  settings: {
    sync: SyncConnectPayload & {
      accountLabel?: string | null;
      syncSpaceId?: string | null;
    };
  };
  unlocked: boolean;
  users: Array<{
    id: string;
    displayName: string;
    sync?: {
      accountId?: string | null;
    } | null;
  }>;
  applyPendingServerAccountExchange(
    exchange: PendingSyncDeviceBindExchange,
  ): Promise<void>;
  createUser(input: {
    username: string;
    password: string;
    secretKey: string;
    sync: Pick<SyncConnectPayload, "mode" | "serverUrl">;
    serverAccount?: {
      serverUrl: string;
      accountId: string;
    };
  }): Promise<{
    secretKeyStorage: "saved" | "unsupported" | "failed";
  }>;
  lock(): Promise<void>;
  persist(): Promise<void>;
  removeActiveUserFromDevice(): Promise<{ displayName: string } | null>;
  restoreServerAccount(input: {
    exchange: PendingSyncDeviceBindExchange;
    password: string;
    secretKey: string;
    requireSecretKeyStorage?: boolean;
  }): Promise<void>;
  saveSyncSettings(input: SyncConnectPayload): Promise<void>;
  switchUser(userId: string): Promise<void>;
}

interface UseUserSessionFlowInput {
  activeDrawer: Ref<unknown>;
  activeModal: Ref<ModalName>;
  clearPendingClipboard(): void;
  clearSensitiveUiState(): void;
  promptServerSignInIfNeeded(): void;
  scheduleAutoSync(reason: string, delayMs?: number): void;
  showToast(message: string): void;
  syncErrorToast(error: unknown): string;
  t: Translate;
  vaultStore: UserSessionStore;
}

export function useUserSessionFlow(input: UseUserSessionFlowInput) {
  const authError = ref("");
  const unlockPassword = ref("");
  const unlockSecretKey = ref("");
  const unlockRequiresSecretKey = ref(false);
  const fullUnlockRequired = ref(false);
  const unlockingVault = ref(false);
  const creatingUser = ref(false);
  const generatedSecretKey = ref("");
  const createdUserName = ref("");
  const setupServerMode = ref<SyncMode>("official");
  const setupServerUrl = ref(input.vaultStore.settings.sync.serverUrl);
  const setupServerBusy = ref(false);
  const pendingServerExchange =
    ref<PendingSyncDeviceBindExchange | null>(null);
  const signingOutCurrentUser = ref(false);
  const pendingSwitchUserId = ref<string | null>(null);
  const returnToUserManagementAfterSetup = ref(false);
  const userDraft = reactive<UserDraft>({
    username: "",
    password: "",
    confirmPassword: "",
  });

  const hasLegacyImport = computed(
    () => Object.keys(input.vaultStore.legacyPayloads).length > 0,
  );
  const pendingSwitchUserName = computed(() => {
    return (
      input.vaultStore.users.find(
        (user) => user.id === pendingSwitchUserId.value,
      )?.displayName ?? ""
    );
  });
  const setupRequiresServerLogin = computed(() => {
    return (
      input.vaultStore.hasUsers === false ||
      (input.vaultStore.needsUserSetup ||
        input.activeModal.value === "user") &&
        !pendingServerExchange.value &&
        !generatedSecretKey.value
    );
  });
  const setupServerAccountFlow = computed(
    () => setupRequiresServerLogin.value || Boolean(pendingServerExchange.value),
  );
  const setupServerConnected = computed(
    () =>
      Boolean(pendingServerExchange.value) || !setupRequiresServerLogin.value,
  );
  const setupServerAccountLabel = computed(() => {
    const exchange = pendingServerExchange.value;
    return exchange?.account.email ?? exchange?.account.displayName ?? "";
  });

  function resetUserDraft(): void {
    userDraft.username = "";
    userDraft.password = "";
    userDraft.confirmPassword = "";
    authError.value = "";
    generatedSecretKey.value = "";
    createdUserName.value = "";
    if (!input.vaultStore.needsUserSetup) {
      pendingServerExchange.value = null;
    }
    setupServerMode.value = input.vaultStore.settings.sync.mode;
    setupServerUrl.value = input.vaultStore.settings.sync.serverUrl;
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

  function applyPendingServerExchange(
    exchange: PendingSyncDeviceBindExchange,
  ): void {
    pendingServerExchange.value = exchange;
    setupServerMode.value = exchange.mode;
    setupServerUrl.value = exchange.serverUrl;
    setupServerBusy.value = false;
    userDraft.username =
      exchange.account.email ??
      exchange.account.displayName ??
      exchange.account.id;
    authError.value = "";
  }

  function openUserManagement(): void {
    returnToUserManagementAfterSetup.value = false;
    input.activeModal.value = "userManagement";
  }

  function openAddUser(
    options: { returnToUserManagement?: boolean } = {},
  ): void {
    resetUserDraft();
    returnToUserManagementAfterSetup.value = Boolean(
      options.returnToUserManagement,
    );
    input.activeModal.value = "user";
  }

  function closeUserSetup(
    options: { returnToPrevious?: boolean } = { returnToPrevious: true },
  ): void {
    const shouldReturnToUserManagement =
      options.returnToPrevious !== false &&
      returnToUserManagementAfterSetup.value;
    input.activeModal.value = shouldReturnToUserManagement
      ? "userManagement"
      : null;
    returnToUserManagementAfterSetup.value = false;
    resetUserDraft();
  }

  function prepareUserSecretKey(): void {
    const validationError = validateUserDraft();
    authError.value = validationError;
    if (validationError) {
      return;
    }

    generatedSecretKey.value = generateSecretKey();
    createdUserName.value =
      userDraft.username.trim() ||
      setupServerAccountLabel.value ||
      input.t("user.currentUser");
  }

  function backToUserDraftFromSecretKey(): void {
    authError.value = "";
    generatedSecretKey.value = "";
    createdUserName.value = "";
  }

  async function restoreExistingServerAccount(payload: {
    password: string;
    secretKey: string;
  }): Promise<void> {
    if (creatingUser.value) return;
    if (!pendingServerExchange.value) {
      authError.value = input.t("sync.syncOfficialAuthorizationMissing");
      return;
    }
    creatingUser.value = true;
    authError.value = "";
    try {
      await input.vaultStore.restoreServerAccount({
        exchange: pendingServerExchange.value,
        password: payload.password,
        secretKey: payload.secretKey,
        requireSecretKeyStorage: true,
      });
      pendingServerExchange.value = null;
      closeUserSetup({ returnToPrevious: false });
      input.showToast(input.t("toast.unlocked"));
      input.scheduleAutoSync("restore-server-account");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      authError.value =
        message === "serverVaultKeyMissing"
          ? input.t("user.serverVaultKeyMissing")
          : message === "secretKeyStorageRequired"
            ? input.t("user.secretKeySaveFailed")
          : message === "local-user-save-failed"
            ? input.t("user.localAccountSaveFailed")
          : message === "duplicate-username"
            ? input.t("user.duplicateUsername")
            : input.t("user.wrongUnlockSecret");
    } finally {
      creatingUser.value = false;
    }
  }

  async function createUser(): Promise<void> {
    if (creatingUser.value) return;
    const validationError = validateUserDraft();
    authError.value = validationError;
    if (validationError) {
      generatedSecretKey.value = "";
      return;
    }
    if (!generatedSecretKey.value) {
      prepareUserSecretKey();
      return;
    }

    creatingUser.value = true;
    try {
      const result = await input.vaultStore.createUser({
        username:
          userDraft.username.trim() ||
          setupServerAccountLabel.value ||
          "server-user",
        password: userDraft.password,
        secretKey: generatedSecretKey.value,
        sync: {
          mode: setupServerMode.value,
          serverUrl: setupServerUrl.value,
        },
        serverAccount: pendingServerExchange.value
          ? {
              serverUrl: pendingServerExchange.value.serverUrl,
              accountId: pendingServerExchange.value.account.id,
            }
          : undefined,
      });
      if (pendingServerExchange.value) {
        await input.vaultStore.applyPendingServerAccountExchange(
          pendingServerExchange.value,
        );
        pendingServerExchange.value = null;
      }
      const toastMessage =
        result.secretKeyStorage === "unsupported"
          ? input.t("toast.secretKeyBrowserPreview")
          : result.secretKeyStorage === "saved"
            ? input.t("toast.secretKeySaved")
            : input.t("toast.secretKeySaveFailed");
      closeUserSetup({ returnToPrevious: false });
      input.showToast(toastMessage);
      input.promptServerSignInIfNeeded();
    } catch (error) {
      authError.value =
        error instanceof Error && error.message === "duplicate-username"
          ? input.t("user.duplicateUsername")
          : error instanceof Error && error.message === "local-user-save-failed"
            ? input.t("user.localAccountSaveFailed")
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
    unlockSecretKey.value = "";
    unlockRequiresSecretKey.value = false;
    fullUnlockRequired.value = false;
    pendingSwitchUserId.value = null;
    input.clearPendingClipboard();
    input.clearSensitiveUiState();
    await input.vaultStore.switchUser(userId);
    input.activeDrawer.value = null;
    input.activeModal.value = input.vaultStore.needsUserSetup ? null : "lock";
  }

  function requestSwitchUser(userId: string): void {
    if (!userId || userId === input.vaultStore.activeUserId) {
      return;
    }

    pendingSwitchUserId.value = userId;
    input.activeModal.value = "switchUserConfirm";
  }

  function closeSwitchUserConfirm(): void {
    pendingSwitchUserId.value = null;
    input.activeModal.value = null;
  }

  async function confirmSwitchUser(): Promise<void> {
    const userId = pendingSwitchUserId.value;
    if (!userId) return;
    await switchUser(userId);
  }

  function openAddUserFromManagement(): void {
    openAddUser({ returnToUserManagement: true });
  }

  function openAddUserFromLock(): void {
    openAddUser();
  }

  async function signOutCurrentUser(payload: {
    deleteLocalData: boolean;
  }): Promise<void> {
    signingOutCurrentUser.value = true;
    const userName = input.vaultStore.activeUser?.displayName ?? "";
    try {
      if (payload.deleteLocalData) {
        const removed = await input.vaultStore.removeActiveUserFromDevice();
        input.clearPendingClipboard();
        input.clearSensitiveUiState();
        input.activeDrawer.value = null;
        input.activeModal.value = input.vaultStore.needsUserSetup
          ? null
          : "lock";
        if (removed) {
          input.showToast(
            input.t("toast.userRemovedFromDevice", {
              name: removed.displayName,
            }),
          );
        }
        return;
      }

      if (input.vaultStore.unlocked) await input.vaultStore.persist();
      await input.vaultStore.lock();
      input.clearPendingClipboard();
      input.clearSensitiveUiState();
      unlockPassword.value = "";
      unlockSecretKey.value = "";
      unlockRequiresSecretKey.value = false;
      authError.value = "";
      input.activeDrawer.value = null;
      input.activeModal.value = "lock";
      input.showToast(input.t("toast.userSignedOut", { name: userName }));
    } catch (error) {
      input.showToast(error instanceof Error ? error.message : String(error));
    } finally {
      signingOutCurrentUser.value = false;
    }
  }

  async function updateSetupServerUrl(serverUrl: string): Promise<void> {
    setupServerUrl.value = serverUrl;
    authError.value = "";
    if (!input.vaultStore.hasUsers) {
      try {
        await input.vaultStore.saveSyncSettings({
          mode: setupServerMode.value,
          serverUrl,
        });
      } catch (error) {
        authError.value = input.syncErrorToast(error);
      }
    }
  }

  function updateSetupServerMode(mode: SyncMode): void {
    setupServerMode.value = mode;
    authError.value = "";
    if (mode === "selfhost") {
      setupServerUrl.value = "";
    }
  }

  function validateUserDraft(): string {
    if (!setupServerAccountFlow.value && !userDraft.username.trim()) {
      return input.t("user.usernameRequired");
    }
    if (userDraft.password.length < 8) {
      return input.t("user.passwordTooShort");
    }
    if (userDraft.password !== userDraft.confirmPassword) {
      return input.t("user.passwordMismatch");
    }

    return "";
  }

  return {
    applyPendingServerExchange,
    applyWebDeviceBindingIfAvailable,
    authError,
    backToUserDraftFromSecretKey,
    closeSwitchUserConfirm,
    closeUserSetup,
    confirmSwitchUser,
    createUser,
    creatingUser,
    generatedSecretKey,
    fullUnlockRequired,
    hasLegacyImport,
    openAddUser,
    openAddUserFromLock,
    openAddUserFromManagement,
    openUserManagement,
    pendingServerExchange,
    pendingSwitchUserId,
    pendingSwitchUserName,
    prepareUserSecretKey,
    createdUserName,
    requestSwitchUser,
    resetUserDraft,
    restoreExistingServerAccount,
    setupServerAccountFlow,
    setupServerAccountLabel,
    setupServerBusy,
    setupServerConnected,
    setupServerMode,
    setupServerUrl,
    signOutCurrentUser,
    signingOutCurrentUser,
    switchUser,
    unlockPassword,
    unlockSecretKey,
    unlockRequiresSecretKey,
    unlockingVault,
    updateSetupServerMode,
    updateSetupServerUrl,
    userDraft,
  };
}
