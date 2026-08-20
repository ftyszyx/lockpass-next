<script setup lang="ts">
import { ArrowLeft, Unlock, UserPlus } from "@lucide/vue";
import { PasswordInput } from "@lockpass/ui";
import { nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import type { DesktopUserProfile } from "@/services/vaultRepository";
import { useVaultStore } from "@/stores/vault";

const props = defineProps<{
  activeUserName: string;
  activeUserInitials: string;
  authError: string;
  password: string;
  secretKey: string;
  secretKeyRequired: boolean;
  fullUnlockRequired: boolean;
  unlocking: boolean;
}>();

const emit = defineEmits<{
  unlock: [];
  unlockSelectedUser: [userId: string];
  addAccount: [];
  useSavedSecretKey: [];
  clearAuthError: [];
  "update:password": [value: string];
  "update:secretKey": [value: string];
}>();

const { t } = useI18n();
const vaultStore = useVaultStore();
const selectedUserId = ref(
  vaultStore.activeUserId ?? vaultStore.users[0]?.id ?? "",
);
const passwordInput = ref<InstanceType<typeof PasswordInput> | null>(null);
const unlockStep = ref<"account" | "password" | "secretKey">(
  props.secretKeyRequired
    ? "secretKey"
    : selectedUserId.value
      ? "password"
      : "account",
);

function preferredUnlockStep(): "account" | "password" | "secretKey" {
  if (props.secretKeyRequired) return "secretKey";
  return selectedUserId.value ? "password" : "account";
}

watch(
  () => [vaultStore.activeUserId, vaultStore.users.length] as const,
  () => {
    selectedUserId.value =
      vaultStore.activeUserId ?? vaultStore.users[0]?.id ?? "";
  },
  { immediate: true },
);

watch(
  () => props.activeUserName,
  () => {
    unlockStep.value = preferredUnlockStep();
    emit("update:secretKey", "");
  },
);

watch(
  () => props.secretKeyRequired,
  (required) => {
    if (required) {
      unlockStep.value = "secretKey";
      return;
    }
    if (unlockStep.value === "secretKey") {
      unlockStep.value = preferredUnlockStep();
    }
  },
  { immediate: true },
);

watch(
  () => props.fullUnlockRequired,
  (required) => {
    if (required && unlockStep.value === "account") {
      unlockStep.value = "password";
    }
  },
  { immediate: true },
);

watch(
  unlockStep,
  async (step) => {
    if (step !== "password") return;
    await nextTick();
    passwordInput.value?.focus();
  },
  { immediate: true },
);

function clearErrorAndSecretKey(): void {
  emit("clearAuthError");
  emit("update:secretKey", "");
}

function continueToUnlock(): void {
  clearErrorAndSecretKey();
  if (selectedUserId.value) emit("unlockSelectedUser", selectedUserId.value);
}

function userLoginLabel(user: DesktopUserProfile): string {
  const account = user.sync?.accountLabel || user.displayName || user.username;
  const server = user.sync?.serverUrl || t("system.serverUrlNotConfigured");
  return server ? `${account} · ${server}` : account;
}

function submitUnlock(): void {
  if (unlockStep.value === "secretKey") {
    emit("unlock");
    return;
  }

  if (unlockStep.value === "account") {
    continueToUnlock();
    return;
  }

  emit("useSavedSecretKey");
}
</script>

<template>
  <div class="auth-backdrop fixed inset-0 z-50 grid place-items-center p-4">
    <form
      class="auth-panel grid w-[420px] max-w-[94vw] gap-4 rounded-lg border p-6"
      @submit.prevent="submitUnlock"
    >
      <div v-if="unlockStep === 'account'" class="grid gap-3">
        <div class="grid gap-1">
          <h2 class="auth-heading">
            {{ t("lock.accountPickerTitle") }}
          </h2>
        </div>
        <label class="form-label">
          {{ t("lock.accountSelectLabel") }}
          <select v-model="selectedUserId" class="form-input">
            <option
              v-for="user in vaultStore.users"
              :key="user.id"
              :value="user.id"
            >
              {{ userLoginLabel(user) }}
            </option>
          </select>
        </label>
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
        <button
          class="primary-button justify-center"
          type="submit"
          :disabled="!selectedUserId || unlocking"
        >
          <Unlock class="size-4" />
          {{ unlocking ? t("lock.unlocking") : t("app.unlock") }}
        </button>
        <button
          class="plain-button justify-center"
          type="button"
          :disabled="unlocking"
          @click="emit('addAccount')"
        >
          <UserPlus class="size-4" />
          {{ t("lock.addAccount") }}
        </button>
      </div>
      <div v-else-if="unlockStep === 'secretKey'" class="grid gap-3">
        <div class="grid gap-1">
          <h2 class="auth-heading">{{ t("lock.secretKeyTitle") }}</h2>
        </div>
        <PasswordInput
          ref="passwordInput"
          :model-value="password"
          class="form-input"
          autocomplete="current-password"
          :placeholder="t('lock.passwordPlaceholder')"
          :show-label="t('user.showPassword')"
          :hide-label="t('user.hidePassword')"
          @update:model-value="emit('update:password', $event)"
        />
        <textarea
          :value="secretKey"
          class="form-input min-h-24 font-mono text-sm"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('lock.secretKeyPlaceholder')"
          @input="emit('update:secretKey', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
        <button class="primary-button justify-center" type="submit" :disabled="unlocking">
          <Unlock class="size-4" />
          {{
            unlocking ? t("lock.unlocking") : t("lock.unlockWithSecretKey")
          }}
        </button>
      </div>
      <template v-else>
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 font-bold">
            <span
              class="brand-avatar grid size-9 place-items-center rounded-lg text-white"
              >{{ activeUserInitials }}</span
            >
            <span
              >{{ activeUserName
              }}<small class="block text-xs text-slate-500">{{
                t("app.locked")
              }}</small></span
            >
          </div>
          <button
            class="plain-button shrink-0 px-2.5"
            type="button"
            :title="t('lock.backToAccounts')"
            :aria-label="t('lock.backToAccounts')"
            @click="unlockStep = 'account'"
          >
            <ArrowLeft class="size-4" />
            {{ t("lock.backToAccounts") }}
          </button>
        </div>
        <div class="grid gap-1">
          <h2 class="auth-heading">{{ t("lock.title") }}</h2>
        </div>
        <PasswordInput
          ref="passwordInput"
          :model-value="password"
          class="form-input"
          autocomplete="current-password"
          :placeholder="t('lock.passwordPlaceholder')"
          :show-label="t('user.showPassword')"
          :hide-label="t('user.hidePassword')"
          @update:model-value="emit('update:password', $event)"
        />
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
        <button class="primary-button justify-center" type="submit" :disabled="unlocking">
          <Unlock class="size-4" />
          {{ unlocking ? t("lock.unlocking") : t("app.unlock") }}
        </button>
      </template>
    </form>
  </div>
</template>
