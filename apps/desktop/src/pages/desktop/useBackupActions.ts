import { ref } from "vue";
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
import type { OperationProgressState } from "./types";

type Translate = (key: string, params?: Record<string, unknown>) => string;

interface BackupStore {
  unlocked: boolean;
  exportBackupPackage(): Promise<unknown>;
  exportCsvText(): Promise<string>;
  importExternalItems(
    items: ExternalImportItem[],
    vaultName: string,
  ): Promise<{ imported: number; vaultName: string }>;
  importExternalVaults(
    vaults: ExternalImportVault[],
    fallbackVaultName: string,
  ): Promise<{ imported: number; vaults: number }>;
  restoreBackupPackage(backup: ReturnType<typeof assertBackupPackage>): Promise<void>;
}

interface UseBackupActionsInput {
  copyValue(value: string, message?: string): Promise<void>;
  lockAfterRestore(): void;
  runWithOperationProgress<T>(
    progress: Pick<OperationProgressState, "title" | "body">,
    task: () => Promise<T>,
  ): Promise<T>;
  showToast(message: string): void;
  t: Translate;
  vaultStore: BackupStore;
}

export function useBackupActions(input: UseBackupActionsInput) {
  const backupBusy = ref(false);
  const savedBackupResult = ref<TextFileSaveResult | null>(null);

  async function createBackup(): Promise<void> {
    await runBackupTask(
      {
        title: input.t("progress.backupExportTitle"),
        body: input.t("progress.backupExportBody"),
      },
      async () => {
        const backup = await input.vaultStore.exportBackupPackage();
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
        title: input.t("progress.backupRestoreTitle"),
        body: input.t("progress.backupRestoreBody"),
      },
      async () => {
        const backup = assertBackupPackage(JSON.parse(await file.text()));
        await input.vaultStore.restoreBackupPackage(backup);
        input.lockAfterRestore();
        input.showToast(input.t("backup.restoreSuccess"));
      },
    );
  }

  async function importCsv(file: File): Promise<void> {
    await runBackupTask(
      {
        title: input.t("progress.csvImportTitle"),
        body: input.t("progress.csvImportBody"),
      },
      async () => {
        const items = parseCsvImport(await file.text(), importFieldLabels());
        const result = await importExternalItems(
          items,
          input.t("backup.csvVaultName"),
        );
        input.showToast(
          input.t("backup.importSuccess", {
            count: result.imported,
            vault: result.vaultName,
          }),
        );
      },
    );
  }

  async function exportCsv(): Promise<void> {
    await runBackupTask(
      {
        title: input.t("progress.csvExportTitle"),
        body: input.t("progress.csvExportBody"),
      },
      async () => {
        const result = await downloadTextFile(
          csvFileName(),
          await input.vaultStore.exportCsvText(),
          "text/csv",
        );
        input.showToast(
          textFileSavedToast(input.t, "backup.csvExportSuccess", result),
        );
      },
    );
  }

  async function importLegacyBackup(payload: {
    file: File;
    password: string;
  }): Promise<void> {
    await runBackupTask(
      {
        title: input.t("progress.legacyImportTitle"),
        body: input.t("progress.legacyImportBody"),
      },
      async () => {
        const result = await readLegacyLockPassBackup(
          payload.file,
          payload.password,
          importFieldLabels(),
          input.t("backup.legacyVaultName"),
        );
        const imported = await importExternalVaults(
          result.vaults,
          input.t("backup.legacyVaultName"),
        );
        input.showToast(
          input.t("backup.legacyImportSuccess", {
            count: imported.imported,
            vaults: imported.vaults,
          }),
        );
      },
    );
  }

  async function copySavedBackupPath(path: string): Promise<void> {
    await input.copyValue(path, input.t("backup.pathCopied"));
  }

  async function openSavedBackupDirectory(path: string): Promise<void> {
    try {
      const opened = await openSavedFileDirectory(path);
      input.showToast(
        opened
          ? input.t("backup.directoryOpened")
          : input.t("backup.browserDirectoryOpenUnsupported"),
      );
    } catch (error) {
      input.showToast(
        error instanceof Error
          ? error.message
          : input.t("backup.directoryOpenFailed"),
      );
    }
  }

  async function importExternalItems(
    items: ExternalImportItem[],
    vaultName: string,
  ): Promise<{ imported: number; vaultName: string }> {
    if (!input.vaultStore.unlocked) throw new Error("syncLocked");
    const result = await input.vaultStore.importExternalItems(items, vaultName);
    if (result.imported === 0) throw new Error("backup-empty-import");
    return { imported: result.imported, vaultName: result.vaultName };
  }

  async function importExternalVaults(
    vaults: ExternalImportVault[],
    fallbackVaultName: string,
  ): Promise<{ imported: number; vaults: number }> {
    if (!input.vaultStore.unlocked) throw new Error("syncLocked");
    const result = await input.vaultStore.importExternalVaults(
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
      await input.runWithOperationProgress(progress, task);
    } catch (error) {
      input.showToast(backupErrorToast(input.t, error));
    } finally {
      backupBusy.value = false;
    }
  }

  function importFieldLabels(): ImportFieldLabelMap {
    return {
      username: input.t("fields.username"),
      password: input.t("fields.password"),
      url: input.t("fields.url"),
      note: input.t("fields.note"),
      cardholder: input.t("fields.cardholder"),
      cardNumber: input.t("fields.cardNumber"),
      expiry: input.t("fields.expiry"),
      cvv: input.t("fields.cvv"),
    };
  }

  return {
    backupBusy,
    copySavedBackupPath,
    createBackup,
    exportCsv,
    importCsv,
    importLegacyBackup,
    openSavedBackupDirectory,
    restoreBackup,
    savedBackupResult,
  };
}

export function backupErrorToast(t: Translate, error: unknown): string {
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

export function textFileSavedToast(
  t: Translate,
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
