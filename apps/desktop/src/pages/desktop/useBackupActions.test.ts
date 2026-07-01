import assert from "node:assert/strict";
import {
  backupErrorToast,
  textFileSavedToast,
} from "./useBackupActions";

const messages: Record<string, string> = {
  "backup.unlockRequired": "unlock required",
  "backup.invalidBackup": "invalid backup",
  "backup.legacyPasswordInvalid": "legacy password invalid",
  "backup.emptyImport": "empty import",
  "backup.failed": "backup failed",
  "backup.exportSavedTo": "saved to {path}",
  "backup.exportDownloadedToBrowser": "{message}: {fileName}",
  "backup.csvExportSuccess": "csv exported",
};

const t = (key: string, params?: Record<string, unknown>) => {
  const template = messages[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    String(params?.[name] ?? match),
  );
};

assert.equal(backupErrorToast(t, new Error("syncLocked")), "unlock required");
assert.equal(
  backupErrorToast(t, new Error("invalid-backup-file")),
  "invalid backup",
);
assert.equal(
  backupErrorToast(t, "legacy-password-invalid"),
  "legacy password invalid",
);
assert.equal(backupErrorToast(t, "backup-empty-import"), "empty import");
assert.equal(backupErrorToast(t, ""), "backup failed");

assert.equal(
  textFileSavedToast(t, "backup.csvExportSuccess", {
    target: "tauri",
    path: "C:/tmp/backup.csv",
  }),
  "saved to C:/tmp/backup.csv",
);

assert.equal(
  textFileSavedToast(t, "backup.csvExportSuccess", {
    target: "browser",
    fileName: "backup.csv",
  }),
  "csv exported: backup.csv",
);

console.log("useBackupActions tests passed");
