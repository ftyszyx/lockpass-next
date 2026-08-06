import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const lockOverlay = read("./components/LockOverlay.vue");
const setupModal = read("./components/UserSetupModal.vue");
const modalLayer = read("./components/DesktopVaultModalLayer.vue");
const page = read("./DesktopVaultPage.vue");
const vaultStore = read("../../stores/vault.ts");
const masterPasswordService = read("../../services/masterPassword.ts");
const rustBackend = read("../../../src-tauri/src/lib.rs");

assert.match(
  lockOverlay,
  /const unlockStep = ref<[^>]+>\([\s\S]*selectedUserId\.value[\s\S]*\? "password"[\s\S]*: "account"/,
  "trusted-device unlock should open the master password prompt for the selected local account",
);
assert.match(
  lockOverlay,
  /@click="unlockStep = 'account'"/,
  "the master password prompt should still allow switching local accounts",
);
assert.match(
  lockOverlay,
  /props\.secretKeyRequired[\s\S]*unlockStep\.value = "secretKey"/,
  "manual Secret Key entry should only open after a Secret Key is required",
);
assert.doesNotMatch(
  lockOverlay,
  /manageUsers|manage-users|t\("user\.manageUsers"\)/,
  "the locked account picker should only allow unlock",
);
assert.match(
  lockOverlay,
  /emit\("unlockSelectedUser", selectedUserId\.value\)/,
  "the account picker should select the account before requesting its master password",
);
assert.doesNotMatch(
  lockOverlay,
  /createNewUser|createNewAccount/,
  "the lock screen should not bypass account management to create an account",
);

assert.match(
  setupModal,
  /v-else-if="showRestoreStep"/,
  "a signed-in server account should proceed directly to device recovery",
);
assert.doesNotMatch(
  setupModal,
  /setupMode|setupChoiceTitle|firstDeviceTitle|restoreDeviceTitle/,
  "device setup should not ask the user to classify themselves",
);
assert.doesNotMatch(
  setupModal,
  /scanSecretKeyQr|savedSecretKey.*checkbox/i,
  "device recovery should not expose unavailable or optional save controls",
);

assert.match(
  modalLayer,
  /:secret-key-required="page\.unlockRequiresSecretKey"/,
  "the Secret Key-required state should reach the lock overlay",
);
assert.match(
  modalLayer,
  /@unlock-selected-user="page\.unlockSelectedUser"/,
  "the lock overlay should route selected-account unlock through the page flow",
);
assert.match(
  page,
  /async function unlockSelectedUser[\s\S]*fullUnlockRequired\.value = true/,
  "selected-account unlock should proceed to the master password step",
);
assert.doesNotMatch(
  page,
  /fastUnlockActiveUser|systemVerificationPrompt|fastUnlockCancelled/,
  "Windows unlock should not request Windows Hello or PIN",
);
assert.doesNotMatch(
  page,
  /unlockActiveUserWithSessionCache|ensureTrustedDeviceFastUnlockForActiveUser/,
  "master password unlock should not reuse a retained vault session or create device fast-unlock keys",
);
assert.doesNotMatch(
  masterPasswordService,
  /createDeviceFastUnlock|unlockUserCryptoWithDeviceUnlockKey|unlockWithDeviceKey/,
  "the desktop crypto service should not expose the retired passwordless-unlock path",
);
assert.match(
  page,
  /loadSavedSecretKeyForActiveUser\(\)[\s\S]*unlockActiveUser\(unlockPassword\.value, result\.secretKey\)/,
  "master password unlock should combine the entered password with the Secret Key from OS secure storage",
);
const tauriCommands = rustBackend.match(/tauri::generate_handler!\[([\s\S]*?)\]\)/)?.[1] ?? "";
assert.match(
  tauriCommands,
  /delete_device_unlock_key/,
  "the desktop backend should retain legacy device-key deletion for migration cleanup",
);
assert.doesNotMatch(
  tauriCommands,
  /device_unlock_capability|save_device_unlock_key|load_device_unlock_key/,
  "the desktop frontend must not be able to create or load the retired passwordless-unlock material",
);
assert.match(
  vaultStore,
  /deleteFastUnlockSecretsForUsers\(data\.users\)[\s\S]*data\.users = data\.users\.map\(stripFastUnlockFromUser\)/,
  "startup should delete legacy device fast-unlock secrets and metadata",
);
assert.match(
  page,
  /activeModal\.value === "user"[\s\S]*vaultStore\.needsUserSetup/,
  "a device-binding callback from account management should set up a separate account",
);
assert.match(
  vaultStore,
  /requireSecretKeyStorage && secretKeyStorage !== 'saved'/,
  "desktop device recovery should require verified OS secure storage",
);
assert.match(
  vaultStore,
  /async lock\(\): Promise<void> \{[\s\S]*await this\.closeCurrentVaultSession\(\)/,
  "locking should destroy the active vault-key session",
);

console.log("user initialization flow tests passed");
