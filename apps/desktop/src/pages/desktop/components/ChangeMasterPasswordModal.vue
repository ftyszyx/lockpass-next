<script setup lang="ts">
import { KeyRound, X } from "@lucide/vue";
import { PasswordInput } from "@lockpass/ui";
import { reactive, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  busy: boolean;
  error: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }];
}>();

const { t } = useI18n();
const form = reactive({
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

watch(
  () => props.busy,
  (busy, previousBusy) => {
    if (previousBusy && !busy && !props.error) resetForm();
  },
);

function resetForm(): void {
  form.currentPassword = "";
  form.newPassword = "";
  form.confirmPassword = "";
}

function close(): void {
  if (props.busy) return;
  resetForm();
  emit("close");
}
</script>

<template>
  <div class="fixed inset-0 z-[80] grid place-items-center bg-slate-950/40">
    <section
      class="w-[440px] max-w-[94vw] rounded-lg border border-slate-200 bg-white shadow-2xl"
      role="dialog"
      aria-modal="true"
      :aria-label="t('settings.changeMasterPasswordTitle')"
    >
      <div class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4">
        <div class="flex items-center gap-2">
          <KeyRound class="size-4 text-teal-700" />
          <h3 class="font-bold">{{ t("settings.changeMasterPasswordTitle") }}</h3>
        </div>
        <button
          class="icon-button"
          type="button"
          :disabled="busy"
          :aria-label="t('editor.close')"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>

      <form @submit.prevent="emit('submit', { ...form })">
        <div class="grid gap-3 p-4">
          <label class="form-label">
            {{ t("settings.currentMasterPassword") }}
            <PasswordInput
              v-model="form.currentPassword"
              class="form-input"
              autocomplete="current-password"
              required
              :show-label="t('user.showPassword')"
              :hide-label="t('user.hidePassword')"
            />
          </label>
          <label class="form-label">
            {{ t("settings.newMasterPassword") }}
            <PasswordInput
              v-model="form.newPassword"
              class="form-input"
              autocomplete="new-password"
              required
              :show-label="t('user.showPassword')"
              :hide-label="t('user.hidePassword')"
            />
          </label>
          <label class="form-label">
            {{ t("settings.confirmNewMasterPassword") }}
            <PasswordInput
              v-model="form.confirmPassword"
              class="form-input"
              autocomplete="new-password"
              required
              :show-label="t('user.showPassword')"
              :hide-label="t('user.hidePassword')"
            />
          </label>
          <p
            v-if="error"
            class="m-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
          >
            {{ error }}
          </p>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button class="plain-button" type="button" :disabled="busy" @click="close">
            {{ t("editor.cancel") }}
          </button>
          <button class="primary-button" type="submit" :disabled="busy">
            <KeyRound class="size-4" />
            {{ busy ? t("settings.changingMasterPassword") : t("settings.changeMasterPasswordAction") }}
          </button>
        </div>
      </form>
    </section>
  </div>
</template>
