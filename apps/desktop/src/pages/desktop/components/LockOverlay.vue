<script setup lang="ts">
import { ArrowLeft, Unlock } from "@lucide/vue";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
  useSavedSecretKey: [];
  clearAuthError: [];
  "update:password": [value: string];
  "update:secretKey": [value: string];
}>();

const { t } = useI18n();
const vaultStore = useVaultStore();
const unlockStep = ref<"account" | "password" | "secretKey">("account");
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
    unlockStep.value = props.secretKeyRequired ? "secretKey" : "account";
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
    if (unlockStep.value === "secretKey") unlockStep.value = "account";
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

function clearErrorAndSecretKey(): void {
  emit("clearAuthError");
  emit("update:secretKey", "");
}

function continueToUnlock(): void {
  clearErrorAndSecretKey();
  if (selectedUserId.value) emit("unlockSelectedUser", selectedUserId.value);
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
      </div>
      <div v-else-if="unlockStep === 'secretKey'" class="grid gap-3">
        <h2 class="text-2xl font-black">{{ t("lock.secretKeyTitle") }}</h2>
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
          :value="secretKey"
          class="form-input min-h-24 font-mono text-sm"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('lock.secretKeyPlaceholder')"
          @input="
            emit(
              'update:secretKey',
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
            unlocking ? t("lock.unlocking") : t("lock.unlockWithSecretKey")
          }}
        </button>
      </div>
      <template v-else>
        <div class="flex items-center justify-between gap-3">
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
          <button
            class="icon-button"
            type="button"
            :title="t('lock.backToAccounts')"
            :aria-label="t('lock.backToAccounts')"
            @click="unlockStep = 'account'"
          >
            <ArrowLeft class="size-4" />
          </button>
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
