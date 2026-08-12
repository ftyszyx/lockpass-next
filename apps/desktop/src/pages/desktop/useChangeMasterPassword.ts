import { ref, type Ref } from "vue";
import type { ModalName } from "./types";

type Translate = (key: string) => string;

interface ChangeMasterPasswordStore {
  unlocked: boolean;
  changeMasterPassword(currentPassword: string, newPassword: string): Promise<void>;
}

interface UseChangeMasterPasswordInput {
  activeModal: Ref<ModalName>;
  showToast(message: string): void;
  t: Translate;
  vaultStore: ChangeMasterPasswordStore;
}

export interface ChangeMasterPasswordPayload {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function useChangeMasterPassword(input: UseChangeMasterPasswordInput) {
  const changingMasterPassword = ref(false);
  const changeMasterPasswordError = ref("");

  function openChangeMasterPassword(): void {
    if (!input.vaultStore.unlocked) return;
    changeMasterPasswordError.value = "";
    input.activeModal.value = "changeMasterPassword";
  }

  function closeChangeMasterPassword(): void {
    if (changingMasterPassword.value) return;
    changeMasterPasswordError.value = "";
    input.activeModal.value = null;
  }

  async function submitMasterPasswordChange(payload: ChangeMasterPasswordPayload): Promise<void> {
    const validationError = validateMasterPasswordChange(payload);
    if (validationError) {
      changeMasterPasswordError.value = input.t(validationError);
      return;
    }

    changingMasterPassword.value = true;
    changeMasterPasswordError.value = "";
    try {
      await input.vaultStore.changeMasterPassword(payload.currentPassword, payload.newPassword);
      input.activeModal.value = null;
      input.showToast(input.t("toast.masterPasswordChanged"));
    } catch (error) {
      changeMasterPasswordError.value = input.t(masterPasswordChangeErrorKey(error));
    } finally {
      changingMasterPassword.value = false;
    }
  }

  return {
    changeMasterPasswordError,
    changingMasterPassword,
    closeChangeMasterPassword,
    openChangeMasterPassword,
    submitMasterPasswordChange,
  };
}

export function validateMasterPasswordChange(payload: ChangeMasterPasswordPayload): string | null {
  if (!payload.currentPassword) return "settings.currentMasterPasswordRequired";
  if (payload.newPassword.length < 8) return "user.passwordTooShort";
  if (payload.newPassword !== payload.confirmPassword) return "user.passwordMismatch";
  if (payload.newPassword === payload.currentPassword) return "settings.newMasterPasswordMustDiffer";
  return null;
}

export function masterPasswordChangeErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "Current password is incorrect") return "settings.currentMasterPasswordIncorrect";
  if (message === "masterPasswordSecretKeyMissing") return "settings.masterPasswordSecretKeyMissing";
  if (message === "masterPasswordSecretKeyUnsupported") return "settings.masterPasswordSecretKeyUnsupported";
  if (message === "masterPasswordSyncRequired") return "settings.masterPasswordSyncRequired";
  if (message === "syncNetworkBlocked") return "settings.masterPasswordServerUnavailable";
  return "settings.changeMasterPasswordFailed";
}
