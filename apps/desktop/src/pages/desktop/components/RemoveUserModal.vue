<script setup lang="ts">
import { CircleHelp, LogOut, Trash2, X } from "@lucide/vue";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  userName: string;
  busy: boolean;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [payload: { deleteLocalData: boolean }];
}>();

const { t } = useI18n();
const deleteLocalData = ref(true);
const helpOpen = ref(false);

watch(
  () => props.userName,
  () => {
    deleteLocalData.value = true;
    helpOpen.value = false;
  },
  { immediate: true },
);
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40">
    <section
      class="w-[440px] max-w-[94vw] rounded-lg border border-slate-200 bg-white shadow-2xl"
    >
      <div
        class="flex min-h-14 items-center justify-between border-b border-slate-200 px-4"
      >
        <h3 class="font-bold">{{ t("settings.signOutUserTitle") }}</h3>
        <button
          class="icon-button"
          type="button"
          :disabled="busy"
          @click="emit('close')"
        >
          <X class="size-4" />
        </button>
      </div>
      <div class="grid gap-4 p-4">
        <div class="flex gap-3 text-slate-700">
          <LogOut class="mt-0.5 size-5 shrink-0" />
          <div class="grid gap-1 text-sm leading-5">
            <strong>{{
              t("settings.signOutUserSummary", { name: userName })
            }}</strong>
            <span class="text-slate-500">{{
              t("settings.signOutUserBody")
            }}</span>
          </div>
        </div>
        <div class="relative">
          <div
            class="grid grid-cols-[16px_minmax(0,1fr)_28px] items-start gap-2 text-sm font-bold text-slate-700"
          >
            <input
              id="sign-out-delete-local-data"
              v-model="deleteLocalData"
              class="mt-1"
              type="checkbox"
            />
            <label for="sign-out-delete-local-data">{{
              t("settings.deleteLocalDataOnSignOut")
            }}</label>
            <button
              class="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              type="button"
              :aria-label="t('settings.signOutDetails')"
              @click="helpOpen = !helpOpen"
            >
              <CircleHelp class="size-4" />
            </button>
          </div>
          <div
            v-if="helpOpen"
            class="absolute right-0 top-8 z-10 w-[320px] max-w-[calc(94vw-32px)] rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600 shadow-xl"
          >
            {{ t("settings.deleteLocalDataOnSignOutHint") }}
          </div>
        </div>
      </div>
      <div class="flex justify-end gap-2 border-t border-slate-200 p-4">
        <button
          class="plain-button"
          type="button"
          :disabled="busy"
          @click="emit('close')"
        >
          {{ t("editor.cancel") }}
        </button>
        <button
          :class="deleteLocalData ? 'danger-button' : 'primary-button'"
          type="button"
          :disabled="busy"
          @click="emit('confirm', { deleteLocalData })"
        >
          <Trash2 v-if="deleteLocalData" class="size-4" />
          <LogOut v-else class="size-4" />
          {{
            busy
              ? t("settings.signingOut")
              : deleteLocalData
                ? t("settings.signOutAndDeleteAction")
                : t("settings.signOutAction")
          }}
        </button>
      </div>
    </section>
  </div>
</template>
