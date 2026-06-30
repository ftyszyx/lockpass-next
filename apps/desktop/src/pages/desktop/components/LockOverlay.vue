<script setup lang="ts">
import { ArrowLeft, Unlock, UserPlus } from "@lucide/vue";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useVaultStore } from "@/stores/vault";

const props = defineProps<{
  activeUserName: string;
  activeUserInitials: string;
  authError: string;
  password: string;
  recoveryKey: string;
  unlocking: boolean;
}>();

const emit = defineEmits<{
  unlock: [];
  useSavedRecoveryKey: [];
  createNewUser: [];
  clearAuthError: [];
  switchUser: [userId: string];
  "update:password": [value: string];
  "update:recoveryKey": [value: string];
}>();

const { t } = useI18n();
const vaultStore = useVaultStore();
const unlockStep = ref<"account" | "password" | "recovery">(
  vaultStore.users.length > 0 ? "password" : "account",
);
const selectedUserId = ref(
  vaultStore.activeUserId ?? vaultStore.users[0]?.id ?? "",
);

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
    if (unlockStep.value !== "account") {
      unlockStep.value = "password";
    }
    emit("update:recoveryKey", "");
  },
);

function clearErrorAndRecoveryKey(): void {
  emit("clearAuthError");
  emit("update:recoveryKey", "");
}

function continueToUnlock(): void {
  clearErrorAndRecoveryKey();
  if (
    selectedUserId.value &&
    selectedUserId.value !== vaultStore.activeUserId
  ) {
    emit("switchUser", selectedUserId.value);
  }
  unlockStep.value = "password";
}

function createNewUser(): void {
  clearErrorAndRecoveryKey();
  emit("createNewUser");
}

function userLoginLabel(user: {
  displayName: string;
  username: string;
  sync?: {
    mode: string;
    accountLabel: string | null;
    serverUrl: string;
  } | null;
}): string {
  const account = user.sync?.accountLabel || user.displayName || user.username;
  const server =
    user.sync?.mode === "official"
      ? t("sync.officialHosted")
      : user.sync?.serverUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return server ? `${account} · ${server}` : account;
}

function submitUnlock(): void {
  if (unlockStep.value === "recovery") {
    emit("unlock");
    return;
  }

  if (unlockStep.value === "account") {
    continueToUnlock();
    return;
  }

  emit("useSavedRecoveryKey");
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 grid place-items-center bg-teal-50/90 backdrop-blur"
  >
    <form
      class="grid w-[400px] max-w-[94vw] gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-2xl"
      @submit.prevent="submitUnlock"
    >
      <div v-if="unlockStep === 'account'" class="grid gap-3">
        <div class="grid gap-1">
          <h2 class="text-2xl font-black">
            {{ t("lock.accountPickerTitle") }}
          </h2>
          <p class="text-sm text-slate-500">
            {{ t("lock.accountPickerBody") }}
          </p>
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
        <button
          class="primary-button justify-center"
          type="submit"
          :disabled="!selectedUserId"
        >
          <Unlock class="size-4" />
          {{ t("app.unlock") }}
        </button>
        <button
          class="plain-button justify-center"
          type="button"
          @click="createNewUser"
        >
          <UserPlus class="size-4" />
          {{ t("lock.createNewAccount") }}
        </button>
      </div>
      <div v-else-if="unlockStep === 'recovery'" class="grid gap-3">
        <button
          class="plain-button justify-self-start"
          type="button"
          @click="unlockStep = 'password'"
        >
          <ArrowLeft class="size-4" />
          {{ t("lock.backToUnlock") }}
        </button>
        <input
          :value="password"
          class="form-input"
          autocomplete="current-password"
          type="password"
          :placeholder="t('lock.passwordPlaceholder')"
          @input="
            emit('update:password', ($event.target as HTMLInputElement).value)
          "
        />
        <textarea
          :value="recoveryKey"
          class="form-input min-h-24 font-mono text-sm"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('lock.recoveryKeyPlaceholder')"
          @input="
            emit(
              'update:recoveryKey',
              ($event.target as HTMLTextAreaElement).value,
            )
          "
        ></textarea>
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
        <button class="primary-button" type="submit" :disabled="unlocking">
          <Unlock class="size-4" />
          {{
            unlocking ? t("lock.unlocking") : t("lock.unlockWithRecoveryKey")
          }}
        </button>
      </div>
      <template v-else>
        <div class="flex items-center gap-3 font-bold">
          <span
            class="grid size-9 place-items-center rounded-lg bg-[#10201e] text-white"
            >{{ activeUserInitials }}</span
          >
          <span
            >{{ activeUserName
            }}<small class="block text-xs text-slate-500">{{
              t("app.locked")
            }}</small></span
          >
        </div>
        <h2 class="text-2xl font-black">{{ t("lock.title") }}</h2>
        <input
          :value="password"
          class="form-input"
          autocomplete="current-password"
          type="password"
          :placeholder="t('lock.passwordPlaceholder')"
          @input="
            emit('update:password', ($event.target as HTMLInputElement).value)
          "
        />
        <p
          v-if="authError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
        >
          {{ authError }}
        </p>
        <button class="primary-button" type="submit" :disabled="unlocking">
          <Unlock class="size-4" />
          {{ unlocking ? t("lock.unlocking") : t("app.unlock") }}
        </button>
      </template>
    </form>
  </div>
</template>
