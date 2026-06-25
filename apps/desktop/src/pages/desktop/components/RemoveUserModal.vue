<script setup lang="ts">
import { LogOut, Trash2, X } from "@lucide/vue";
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
const deleteLocalData = ref(false);

watch(
  () => props.userName,
  () => {
    deleteLocalData.value = false;
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
        <label
          class="grid grid-cols-[16px_minmax(0,1fr)] gap-2 text-sm font-bold text-slate-700"
        >
          <input v-model="deleteLocalData" class="mt-1" type="checkbox" />
          <span>{{ t("settings.deleteLocalDataOnSignOut") }}</span>
        </label>
        <details
          class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500"
        >
          <summary class="cursor-pointer select-none font-bold text-slate-600">
            {{ t("settings.signOutDetails") }}
          </summary>
          <p class="mt-2">{{ t("settings.deleteLocalDataOnSignOutHint") }}</p>
        </details>
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
