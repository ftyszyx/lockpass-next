import assert from "node:assert/strict";
import {
  masterPasswordChangeErrorKey,
  validateMasterPasswordChange,
} from "./useChangeMasterPassword";

assert.equal(
  validateMasterPasswordChange({
    currentPassword: "",
    newPassword: "new-password",
    confirmPassword: "new-password",
  }),
  "settings.currentMasterPasswordRequired",
);
assert.equal(
  validateMasterPasswordChange({
    currentPassword: "old-password",
    newPassword: "short",
    confirmPassword: "short",
  }),
  "user.passwordTooShort",
);
assert.equal(
  validateMasterPasswordChange({
    currentPassword: "old-password",
    newPassword: "new-password",
    confirmPassword: "different-password",
  }),
  "user.passwordMismatch",
);
assert.equal(
  validateMasterPasswordChange({
    currentPassword: "same-password",
    newPassword: "same-password",
    confirmPassword: "same-password",
  }),
  "settings.newMasterPasswordMustDiffer",
);
assert.equal(
  validateMasterPasswordChange({
    currentPassword: "old-password",
    newPassword: "new-password",
    confirmPassword: "new-password",
  }),
  null,
);

assert.equal(
  masterPasswordChangeErrorKey(new Error("Current password is incorrect")),
  "settings.currentMasterPasswordIncorrect",
);
assert.equal(
  masterPasswordChangeErrorKey(new Error("masterPasswordSecretKeyMissing")),
  "settings.masterPasswordSecretKeyMissing",
);
assert.equal(
  masterPasswordChangeErrorKey(new Error("syncNetworkBlocked")),
  "settings.masterPasswordServerUnavailable",
);
assert.equal(
  masterPasswordChangeErrorKey(new Error("unexpected")),
  "settings.changeMasterPasswordFailed",
);

console.log("useChangeMasterPassword tests passed");
