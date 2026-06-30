<script setup lang="ts">
import {
  ArrowLeft,
  Check,
  CircleHelp,
  Cloud,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  Save,
  ScanLine,
  Unlock,
  UserPlus,
  X,
} from "@lucide/vue";
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { SyncMode } from "@/services/syncClient";
import type { UserDraft } from "../types";

const props = defineProps<{
  draft: UserDraft;
  authError: string;
  creating: boolean;
  isAdding: boolean;
  isLegacyImport: boolean;
  recoveryKey: string;
  createdUserName: string;
  initialMode: "choice" | "new" | "restore";
  serverFirst: boolean;
  serverConnected: boolean;
  serverAccountLabel: string;
  serverMode: SyncMode;
  serverUrl: string;
  serverBusy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  generateRecoveryKey: [];
  submit: [];
  backToNewUser: [];
  restoreExisting: [payload: { password: string; recoveryKey: string }];
  scanRecoveryQr: [];
  updateServerMode: [mode: SyncMode];
  updateServerUrl: [serverUrl: string];
  openServerLogin: [mode: "login" | "register"];
}>();

const { t } = useI18n();
const setupMode = ref<"choice" | "new" | "restore">("choice");
const savedOfflineConfirmed = ref(false);
const savedOfflineConfirmInput = ref<HTMLInputElement | null>(null);
const savedOfflineConfirmAttention = ref(false);
const restorePassword = ref("");
const restoreRecoveryKey = ref("");
const masterPasswordVisible = ref(false);
const confirmPasswordVisible = ref(false);
const showSelfhostDialog = ref(false);
const selfhostHelpOpen = ref(false);
const selfhostUrlDraft = ref("");
const selfhostUrlError = ref(false);
const serverSetupDone = computed(
  () => !props.serverFirst || props.serverConnected,
);
const showSetupChoice = computed(
  () => !props.recoveryKey && !props.isLegacyImport,
);
const canRestoreExisting = computed(
  () =>
    restorePassword.value.length > 0 &&
    restoreRecoveryKey.value.trim().length > 0,
);
const showServerStep = computed(
  () =>
    props.serverFirst &&
    !props.recoveryKey &&
    !props.isLegacyImport &&
    !serverSetupDone.value,
);

watch(
  () => [props.recoveryKey, props.isLegacyImport, props.initialMode] as const,
  () => {
    setupMode.value =
      props.recoveryKey || props.isLegacyImport ? "new" : props.initialMode;
    if (setupMode.value !== "restore") {
      restorePassword.value = "";
      restoreRecoveryKey.value = "";
    }
  },
  { immediate: true },
);

watch(
  () => props.recoveryKey,
  () => {
    savedOfflineConfirmed.value = false;
    savedOfflineConfirmAttention.value = false;
  },
);

watch(savedOfflineConfirmed, (confirmed) => {
  if (confirmed) savedOfflineConfirmAttention.value = false;
});

function showChoice(): void {
  setupMode.value = "choice";
  restorePassword.value = "";
  restoreRecoveryKey.value = "";
}

function handleSubmit(): void {
  if (showServerStep.value) {
    openServerLogin("login");
    return;
  }

  if (props.recoveryKey) {
    if (savedOfflineConfirmed.value) {
      emit("submit");
      return;
    }

    requestSavedOfflineConfirmation();
    return;
  }

  if (setupMode.value === "restore") {
    submitRestoreExisting();
    return;
  }

  if (!showSetupChoice.value || setupMode.value === "new") {
    emit("generateRecoveryKey");
  }
}

function openServerLogin(mode: "login" | "register"): void {
  if (props.serverMode === "selfhost" && !props.serverUrl.trim()) {
    selfhostUrlDraft.value = "";
    showSelfhostDialog.value = true;
    return;
  }
  emit("openServerLogin", mode);
}

function requestSavedOfflineConfirmation(): void {
  savedOfflineConfirmAttention.value = false;
  window.requestAnimationFrame(() => {
    savedOfflineConfirmAttention.value = true;
    savedOfflineConfirmInput.value?.focus();
  });
}

function handleBackFromRecoveryKey(): void {
  savedOfflineConfirmed.value = false;
  savedOfflineConfirmAttention.value = false;
  emit("backToNewUser");
}

function submitRestoreExisting(): void {
  if (!canRestoreExisting.value) return;
  emit("restoreExisting", {
    password: restorePassword.value,
    recoveryKey: restoreRecoveryKey.value.trim(),
  });
}

function updateServerMode(event: Event): void {
  const mode = (event.target as HTMLSelectElement).value as SyncMode;
  const previousMode = props.serverMode;
  emit("updateServerMode", mode);
  if (mode === "selfhost") {
    selfhostUrlDraft.value =
      previousMode === "selfhost" ? props.serverUrl.trim() : "";
    selfhostUrlError.value = false;
    showSelfhostDialog.value = true;
  }
}

function closeSelfhostDialog(restoreOfficial: boolean): void {
  showSelfhostDialog.value = false;
  selfhostHelpOpen.value = false;
  selfhostUrlError.value = false;
  if (restoreOfficial && props.serverMode === "selfhost") {
    emit("updateServerMode", "official");
  }
}

function saveSelfhostUrl(): void {
  const serverUrl = selfhostUrlDraft.value.trim();
  if (!serverUrl) {
    selfhostUrlError.value = true;
    return;
  }
  emit("updateServerUrl", serverUrl);
  selfhostUrlError.value = false;
  showSelfhostDialog.value = false;
}
</script>

<template>
  <div
    :class="
      isAdding
        ? 'fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4'
        : 'fixed inset-0 z-50 grid place-items-center bg-[#f6f8fb]'
    "
  >
    <form
      class="relative grid w-[500px] max-w-[94vw] gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-2xl"
      @submit.prevent="handleSubmit"
    >
      <button
        v-if="isAdding"
        class="icon-button absolute right-4 top-4"
        type="button"
        :aria-label="t('editor.close')"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>

      <div v-if="showServerStep" class="grid gap-4">
        <div class="grid gap-1">
          <h2 class="text-2xl font-black">
            {{ t("user.serverAccountTitle") }}
          </h2>
        </div>
        <div class="grid gap-3">
          <label class="form-label">
            {{ t("sync.mode") }}
            <select
              class="form-input"
              :value="serverMode"
              :disabled="serverBusy"
              @change="updateServerMode"
            >
              <option value="official">{{ t("sync.officialHosted") }}</option>
              <option value="selfhost">{{ t("sync.selfHosted") }}</option>
            </select>
          </label>
          <div class="grid gap-2">
            <button
              class="primary-button justify-center"
              type="submit"
              :disabled="serverBusy"
            >
              <LogIn class="size-4" />
              {{
                serverBusy
                  ? t("sync.officialLoginPending")
                  : t("user.serverLoginAction")
              }}
            </button>
            <button
              class="plain-button justify-center"
              type="button"
              :disabled="serverBusy"
              @click="openServerLogin('register')"
            >
              <UserPlus class="size-4" />
              {{ t("user.createServerAccountAction") }}
            </button>
          </div>
        </div>
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
      </div>

      <div
        v-else-if="!recoveryKey && showSetupChoice && setupMode === 'choice'"
        class="grid gap-3"
      >
        <div
          v-if="serverFirst"
          class="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900"
        >
          {{
            t("user.serverConnectedBody", {
              account: serverAccountLabel || t("sync.connected"),
            })
          }}
        </div>
        <h2 class="text-2xl font-black">{{ t("user.setupChoiceTitle") }}</h2>
        <button
          class="grid min-h-20 gap-1 rounded-lg border border-teal-200 bg-teal-50 p-4 text-left hover:border-teal-400"
          type="button"
          @click="setupMode = 'new'"
        >
          <span class="flex items-center gap-2 font-bold text-teal-950"
            ><UserPlus class="size-4" />{{ t("user.firstDeviceTitle") }}</span
          >
          <span class="text-sm text-teal-800">{{
            t("user.firstDeviceBody")
          }}</span>
        </button>
        <button
          class="grid min-h-20 gap-1 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-slate-400"
          type="button"
          @click="setupMode = 'restore'"
        >
          <span class="flex items-center gap-2 font-bold"
            ><Cloud class="size-4" />{{ t("user.restoreDeviceTitle") }}</span
          >
          <span class="text-sm text-slate-500">{{
            t("user.restoreDeviceBody")
          }}</span>
        </button>
      </div>

      <div
        v-else-if="!recoveryKey && showSetupChoice && setupMode === 'restore'"
        class="grid gap-3"
      >
        <button
          class="plain-button justify-self-start"
          type="button"
          @click="showChoice"
        >
          <ArrowLeft class="size-4" />
          {{ t("user.backToPrevious") }}
        </button>
        <h2 class="text-2xl font-black">
          {{ t("user.existingRecoveryTitle") }}
        </h2>
        <label class="form-label">
          {{ t("user.masterPassword") }}
          <input
            v-model="restorePassword"
            class="form-input"
            autocomplete="current-password"
            type="password"
            :placeholder="t('lock.passwordPlaceholder')"
          />
        </label>
        <label class="form-label">
          {{ t("user.recoveryKey") }}
          <textarea
            v-model="restoreRecoveryKey"
            class="form-input min-h-24 font-mono text-sm"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('user.recoveryKeyInputPlaceholder')"
          ></textarea>
        </label>
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="plain-button"
            type="button"
            @click="emit('scanRecoveryQr')"
          >
            <ScanLine class="size-4" />
            {{ t("user.scanRecoveryQr") }}
          </button>
          <button
            class="primary-button"
            type="submit"
            :disabled="!canRestoreExisting"
          >
            <Unlock class="size-4" />
            {{ t("user.recoverAndUnlock") }}
          </button>
        </div>
      </div>

      <div v-else-if="!recoveryKey" class="grid gap-3">
        <button
          v-if="showSetupChoice"
          class="plain-button justify-self-start"
          type="button"
          @click="showChoice"
        >
          <ArrowLeft class="size-4" />
          {{ t("user.backToPrevious") }}
        </button>
        <h2 class="text-2xl font-black">
          {{
            isLegacyImport
              ? t("user.firstRunTitle")
              : t("user.newUserCreateTitle")
          }}
        </h2>
        <p v-if="isLegacyImport" class="text-sm text-slate-500">
          {{ t("user.legacyImportBody") }}
        </p>
        <label v-if="!serverFirst" class="form-label">
          {{ t("user.username") }}
          <input
            v-model="draft.username"
            class="form-input"
            autocomplete="username"
            :placeholder="t('user.usernamePlaceholder')"
          />
        </label>
        <label class="form-label">
          {{ t("user.masterPassword") }}
          <span class="password-input-wrap">
            <input
              v-model="draft.password"
              class="form-input pr-10"
              autocomplete="new-password"
              :type="masterPasswordVisible ? 'text' : 'password'"
            />
            <button
              class="password-visibility-button"
              type="button"
              :title="
                masterPasswordVisible
                  ? t('user.hidePassword')
                  : t('user.showPassword')
              "
              :aria-label="
                masterPasswordVisible
                  ? t('user.hidePassword')
                  : t('user.showPassword')
              "
              @click="masterPasswordVisible = !masterPasswordVisible"
            >
              <EyeOff v-if="masterPasswordVisible" class="size-4" />
              <Eye v-else class="size-4" />
            </button>
          </span>
        </label>
        <label class="form-label">
          {{ t("user.confirmPassword") }}
          <span class="password-input-wrap">
            <input
              v-model="draft.confirmPassword"
              class="form-input pr-10"
              autocomplete="new-password"
              :type="confirmPasswordVisible ? 'text' : 'password'"
            />
            <button
              class="password-visibility-button"
              type="button"
              :title="
                confirmPasswordVisible
                  ? t('user.hidePassword')
                  : t('user.showPassword')
              "
              :aria-label="
                confirmPasswordVisible
                  ? t('user.hidePassword')
                  : t('user.showPassword')
              "
              @click="confirmPasswordVisible = !confirmPasswordVisible"
            >
              <EyeOff v-if="confirmPasswordVisible" class="size-4" />
              <Eye v-else class="size-4" />
            </button>
          </span>
        </label>
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
        <div class="flex justify-end">
          <button class="primary-button" type="submit" :disabled="creating">
            <Save class="size-4" />
            {{
              creating
                ? t("app.loading")
                : t("user.createAndGenerateRecoveryKey")
            }}
          </button>
        </div>
      </div>

      <div v-else class="grid gap-3">
        <button
          class="plain-button justify-self-start"
          type="button"
          @click="handleBackFromRecoveryKey"
        >
          <ArrowLeft class="size-4" />
          {{ t("user.backToPrevious") }}
        </button>
        <span
          class="inline-flex size-10 items-center justify-center rounded-lg bg-teal-50 text-teal-800"
          ><KeyRound class="size-5"
        /></span>
        <div class="grid gap-1">
          <h2 class="text-2xl font-black">
            {{ t("user.recoveryKeySaveTitle") }}
          </h2>
          <p class="text-sm text-slate-500">
            {{ t("user.recoveryKeySaveBody", { name: createdUserName }) }}
          </p>
        </div>
        <textarea
          class="form-input min-h-24 font-mono text-sm leading-6"
          readonly
          :value="recoveryKey"
        ></textarea>
        <label
          class="saved-confirm-check flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-sm font-semibold text-slate-700"
          :class="{
            'saved-confirm-check-attention': savedOfflineConfirmAttention,
          }"
        >
          <input
            ref="savedOfflineConfirmInput"
            v-model="savedOfflineConfirmed"
            class="size-4 accent-teal-700"
            type="checkbox"
          />
          {{ t("user.savedRecoveryKeyConfirm") }}
        </label>
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
        <div class="flex justify-end">
          <button class="primary-button" type="submit" :disabled="creating">
            <Check class="size-4" />
            {{ creating ? t("app.loading") : t("user.enterVault") }}
          </button>
        </div>
      </div>
    </form>

    <div
      v-if="showSelfhostDialog"
      class="fixed inset-0 z-10 grid place-items-center bg-slate-950/30 p-4"
    >
      <section
        class="grid w-[440px] max-w-[94vw] gap-4 rounded-lg bg-white p-5 shadow-2xl"
      >
        <div class="flex items-center justify-between gap-3">
          <div class="relative flex items-center gap-2">
            <h2 class="text-xl font-black">{{ t("sync.selfHosted") }}</h2>
            <button
              class="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              type="button"
              :aria-label="t('settings.signOutDetails')"
              @click="selfhostHelpOpen = !selfhostHelpOpen"
            >
              <CircleHelp class="size-4" />
            </button>
            <div
              v-if="selfhostHelpOpen"
              class="absolute left-0 top-9 z-10 w-[320px] max-w-[calc(94vw-32px)] rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl"
            >
              {{ t("sync.selfHostedUrlHelp") }}
            </div>
          </div>
          <button
            class="plain-button size-9 justify-center p-0"
            type="button"
            :aria-label="t('editor.close')"
            @click="closeSelfhostDialog(true)"
          >
            <X class="size-4" />
          </button>
        </div>
        <label class="form-label">
          {{ t("sync.serverUrl") }}
          <input
            v-model="selfhostUrlDraft"
            class="form-input"
            :placeholder="t('sync.serverUrlPlaceholder')"
          />
        </label>
        <p
          v-if="selfhostUrlError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ t("sync.syncServerRequired") }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="plain-button"
            type="button"
            @click="closeSelfhostDialog(true)"
          >
            {{ t("editor.cancel") }}
          </button>
          <button class="primary-button" type="button" @click="saveSelfhostUrl">
            {{ t("editor.save") }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.password-input-wrap {
  position: relative;
  display: block;
}

.password-visibility-button {
  position: absolute;
  top: 50%;
  right: 6px;
  display: inline-flex;
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  color: rgb(71 85 105);
  border-radius: 8px;
  transform: translateY(-50%);
}

.password-visibility-button:hover {
  color: rgb(15 118 110);
  background: rgb(240 253 250);
}

.saved-confirm-check {
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    box-shadow 120ms ease,
    transform 120ms ease;
}

.saved-confirm-check-attention {
  animation: saved-confirm-flash 520ms ease-in-out 2;
}

@keyframes saved-confirm-flash {
  0%,
  100% {
    border-color: transparent;
    background-color: transparent;
    box-shadow: none;
    transform: translateX(0);
  }

  25% {
    border-color: rgb(244 63 94);
    background-color: rgb(255 241 242);
    box-shadow: 0 0 0 3px rgb(244 63 94 / 14%);
    transform: translateX(-2px);
  }

  50% {
    transform: translateX(2px);
  }

  75% {
    border-color: rgb(244 63 94);
    background-color: rgb(255 241 242);
    box-shadow: 0 0 0 3px rgb(244 63 94 / 14%);
    transform: translateX(-1px);
  }
}
</style>
