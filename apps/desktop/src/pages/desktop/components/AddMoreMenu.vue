<script setup lang="ts">
import { ChevronDown, Plus } from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { isEventOutsideElement } from "../domEvents";
import type { AddMoreItemKind, AddMoreMenuItem } from "../types";

defineProps<{
  items: AddMoreMenuItem[];
}>();

const emit = defineEmits<{
  select: [kind: AddMoreItemKind];
}>();

const { t } = useI18n();
const open = ref(false);
const menuRoot = ref<HTMLElement | null>(null);

function select(kind: AddMoreItemKind): void {
  open.value = false;
  emit("select", kind);
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (isEventOutsideElement(event, menuRoot.value)) {
    open.value = false;
  }
}

onMounted(() =>
  document.addEventListener("pointerdown", onDocumentPointerDown, true),
);
onBeforeUnmount(() =>
  document.removeEventListener("pointerdown", onDocumentPointerDown, true),
);
</script>

<template>
  <div ref="menuRoot" class="relative justify-self-start">
    <button
      class="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-200 px-3 text-sm font-bold text-sky-700 hover:bg-slate-300/70"
      type="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="open = !open"
    >
      <Plus class="size-4" />
      <span>{{ t("editor.addMore") }}</span>
      <ChevronDown class="size-4" />
    </button>

    <div
      v-if="open"
      class="absolute bottom-10 left-0 z-30 mb-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
      role="menu"
    >
      <template v-for="(item, index) in items" :key="`${item.kind}-${index}`">
        <div v-if="index > 0" class="border-t border-slate-100"></div>
        <button
          class="block h-9 w-full px-3 text-left text-sm font-semibold hover:bg-slate-50"
          type="button"
          role="menuitem"
          @click="select(item.kind)"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </div>
</template>
