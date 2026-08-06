<script setup lang="ts">
import { RefreshCw, TriangleAlert } from "@lucide/vue";
import { useI18n } from "vue-i18n";

defineProps<{
  initializing: boolean;
  storageError: string;
  variant: "loading" | "storageError";
}>();

const emit = defineEmits<{
  retry: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div
    class="app-shell grid h-screen min-h-[560px] place-items-center p-6 text-slate-950"
  >
    <div
      v-if="variant === 'loading'"
      class="inline-flex items-center gap-2 text-sm font-semibold text-slate-500"
    >
      <RefreshCw class="size-4 animate-spin" />
      {{ t("app.loading") }}
    </div>

    <section
      v-else
      class="grid w-full max-w-xl gap-5 rounded-lg border border-rose-200 bg-white p-6 shadow-xl shadow-rose-950/5"
    >
      <span
        class="grid size-12 place-items-center rounded-lg bg-rose-50 text-rose-700"
      >
        <TriangleAlert class="size-6" />
      </span>
      <div class="grid gap-2">
        <h1 class="text-2xl font-black">{{ t("app.storageError") }}</h1>
        <p class="text-sm leading-6 text-slate-600">
          {{ t("app.storageErrorBody") }}
        </p>
      </div>
      <div
        class="grid gap-1 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2"
      >
        <span class="text-xs font-bold text-rose-700">{{
          t("app.storageErrorDetail")
        }}</span>
        <code class="break-words font-mono text-xs text-rose-900">{{
          storageError
        }}</code>
      </div>
      <button
        class="primary-button justify-self-start"
        type="button"
        :disabled="initializing"
        @click="emit('retry')"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': initializing }" />
        {{ initializing ? t("app.loading") : t("app.retry") }}
      </button>
    </section>
  </div>
</template>
