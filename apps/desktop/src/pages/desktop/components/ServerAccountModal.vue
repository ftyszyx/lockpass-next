<script setup lang="ts">
import {
  Cloud,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { configuredOfficialApiUrl } from "@/services/appConfig";
import type { SyncMode } from "@/services/syncClient";
import { openExternalUrl } from "@/services/vaultRepository";
import { useVaultStore } from "@/stores/vault";

const emit = defineEmits<{
  close: [];
  syncToast: [message: string];
  operationStart: [payload: { title: string; body: string }];
  operationEnd: [];
}>();

const { t } = useI18n();
const vaultStore = useVaultStore();
const syncMode = ref<SyncMode>(vaultStore.settings.sync.mode);
const syncServerUrl = ref(vaultStore.settings.sync.serverUrl);
const syncBusy = ref(false);
const syncErrorKey = ref("");
const officialServerOptionLabel = computed(
  () => `${t("sync.officialHosted")} · ${configuredOfficialApiUrl()}`,
);
const selfHostedServerOptionLabel = computed(() => {
  const serverUrl = syncServerUrl.value.trim();
  return serverUrl
    ? `${t("sync.selfHosted")} · ${serverUrl}`
    : t("sync.selfHosted");
});
const syncConnected = computed(() => vaultStore.syncConnected);
const officialLoginInProgress = computed(
  () => vaultStore.officialLogin.inProgress,
);
const visibleSyncErrorKey = computed(() => {
  if (syncErrorKey.value) return syncErrorKey.value;
  if (vaultStore.officialLogin.lastError) {
    return syncErrorMessageKey(vaultStore.officialLogin.lastError);
  }
  return "";
});
const syncState = computed<"offline" | "needsSync" | "conflicted" | "synced">(
  () => {
    if (!syncConnected.value) return "offline";
    if (vaultStore.syncConflictCount > 0) return "conflicted";
    if (
      !vaultStore.settings.sync.lastSyncAt ||
      vaultStore.syncLocalChangeCount > 0
    ) {
      return "needsSync";
    }
    return "synced";
  },
);
const syncStatusTitle = computed(() => {
  if (syncState.value === "offline") return t("sync.offlineTitle");
  if (syncState.value === "conflicted") return t("sync.conflictedTitle");
  if (syncState.value === "needsSync") return t("sync.needsSyncTitle");
  return t("sync.syncedTitle");
});
const syncStatusBody = computed(() => {
  if (syncState.value === "offline") return t("sync.offlineBody");
  if (syncState.value === "conflicted") {
    return t("sync.conflictedBody", { count: vaultStore.syncConflictCount });
  }
  if (!vaultStore.settings.sync.lastSyncAt) return t("sync.neverSyncedBody");
  if (vaultStore.syncLocalChangeCount > 0) {
    return t("sync.localChangesBody", {
      count: vaultStore.syncLocalChangeCount,
    });
  }
  return t("sync.syncedBody", {
    account: vaultStore.settings.sync.accountLabel || vaultStore.syncHostLabel,
    time: new Date(vaultStore.settings.sync.lastSyncAt).toLocaleString(
      vaultStore.settings.locale,
    ),
  });
});
const syncStatusCardClass = computed(() => {
  if (syncState.value === "offline" || syncState.value === "conflicted") {
    return "border-rose-200 bg-rose-50 text-rose-950";
  }
  if (syncState.value === "needsSync") {
    return "border-amber-200 bg-amber-50 text-amber-950";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-950";
});
const isSelfHostedSync = computed(() => syncMode.value === "selfhost");
const officialLoginButtonLabel = computed(() => {
  if (syncBusy.value || officialLoginInProgress.value) {
    return t("sync.officialLoginPending");
  }
  return t("sync.openServerLogin");
});

watch(
  () => vaultStore.syncConnected,
  (connected) => {
    if (!connected) return;
    vaultStore.clearOfficialLoginState();
    syncErrorKey.value = "";
  },
);

async function openSyncLogin(): Promise<void> {
  syncBusy.value = true;
  vaultStore.setOfficialLoginInProgress(true);
  syncErrorKey.value = "";
  try {
    await vaultStore.saveSyncSettings({
      mode: syncMode.value,
      serverUrl: syncServerUrl.value,
    });
    const authorization = await vaultStore.startOfficialSyncAuthorization();
    syncServerUrl.value = vaultStore.settings.sync.serverUrl;
    await openExternalUrl(authorization.loginUrl);
    emit("syncToast", t("sync.officialLoginPendingBody"));
  } catch (error) {
    vaultStore.clearOfficialLoginState();
    syncErrorKey.value = syncErrorMessageKey(error);
  } finally {
    syncBusy.value = false;
  }
}

async function runSyncNow(): Promise<void> {
  syncBusy.value = true;
  vaultStore.clearOfficialLoginState();
  syncErrorKey.value = "";
  emit("operationStart", {
    title: t("progress.syncTitle"),
    body: t("progress.syncBody"),
  });
  const startedAt = performance.now();
  try {
    const result = await vaultStore.runSync();
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
    emit("syncToast", message);
  } catch (error) {
    syncErrorKey.value = syncErrorMessageKey(error);
  } finally {
    const elapsed = performance.now() - startedAt;
    if (elapsed < 450) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, 450 - elapsed),
      );
    }
    emit("operationEnd");
    syncBusy.value = false;
  }
}

async function disconnectSync(): Promise<void> {
  syncBusy.value = true;
  syncErrorKey.value = "";
  try {
    await vaultStore.disconnectSync();
    emit("syncToast", t("sync.disconnectSuccess"));
  } catch (error) {
    syncErrorKey.value = syncErrorMessageKey(error);
  } finally {
    syncBusy.value = false;
  }
}

function syncErrorMessageKey(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";
  if (
    message === "syncLocked" ||
    message === "syncOfficialUnavailable" ||
    message === "syncServerRequired" ||
    message === "syncNotConnected" ||
    message === "syncConnectionInvalid" ||
    message === "syncUnsupportedId" ||
    message === "syncOfficialAuthorizationMissing" ||
    message === "syncOfficialCallbackMismatch" ||
    message === "syncOfficialDenied" ||
    message === "syncOfficialExpired" ||
    message === "syncNetworkBlocked" ||
    message === "popup_blocked"
  ) {
    return `sync.${message}`;
  }
  return "sync.syncFailed";
}
</script>

<template>
  <div
    class="auth-modal-backdrop fixed inset-0 z-[70] grid place-items-center p-4"
    @pointerdown.self="emit('close')"
  >
    <section
      class="auth-panel relative grid w-[500px] max-w-[94vw] gap-4 rounded-lg border p-6 shadow-2xl"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="'server-account-title'"
    >
      <button
        class="icon-button absolute right-4 top-4"
        type="button"
        :aria-label="t('editor.close')"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>

      <span class="auth-mark" aria-hidden="true">
        <ShieldCheck class="size-5" />
      </span>

      <h2 id="server-account-title" class="auth-heading pr-10">
        {{ t("sync.title") }}
      </h2>

      <div
        class="grid gap-1 rounded-lg border px-3 py-2 text-left"
        :class="syncStatusCardClass"
      >
        <div class="flex items-center gap-2 font-bold">
          <Cloud class="size-4" />
          {{ syncStatusTitle }}
        </div>
        <p class="text-xs leading-5 text-slate-500">{{ syncStatusBody }}</p>
      </div>

      <label class="form-label">
        {{ t("sync.mode") }}
        <select
          v-model="syncMode"
          class="form-input"
          :disabled="syncBusy || syncConnected"
        >
          <option value="official">{{ officialServerOptionLabel }}</option>
          <option value="selfhost">{{ selfHostedServerOptionLabel }}</option>
        </select>
      </label>

      <label v-if="isSelfHostedSync && !syncConnected" class="form-label">
        {{ t("sync.serverUrl") }}
        <input
          v-model="syncServerUrl"
          class="form-input"
          :disabled="syncBusy"
          :placeholder="t('sync.serverUrlPlaceholder')"
        />
      </label>

      <button
        v-if="!syncConnected"
        class="primary-button justify-center"
        type="button"
        :disabled="syncBusy"
        @click="openSyncLogin"
      >
        <LogIn class="size-4" />
        {{ officialLoginButtonLabel }}
      </button>

      <div v-else class="grid grid-cols-2 gap-2">
        <button
          class="plain-button justify-center"
          type="button"
          :disabled="syncBusy"
          @click="runSyncNow"
        >
          <RefreshCw class="size-4" />
          {{ t("sync.syncNow") }}
        </button>
        <button
          class="plain-button justify-center"
          type="button"
          :disabled="syncBusy"
          @click="disconnectSync"
        >
          <LogOut class="size-4" />
          {{ t("sync.disconnect") }}
        </button>
      </div>

      <p
        v-if="visibleSyncErrorKey"
        class="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
      >
        {{ t(visibleSyncErrorKey) }}
      </p>
    </section>
  </div>
</template>
