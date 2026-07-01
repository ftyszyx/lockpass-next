<script setup lang="ts">
import { ChevronDown, Plus } from "@lucide/vue";
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { isEventOutsideElement } from "../domEvents";
import type { AddMoreItemKind, AddMoreMenuItem } from "../types";
import { calculateAddMoreMenuPosition } from "./addMoreMenuPosition";

defineProps<{
  items: AddMoreMenuItem[];
}>();

const emit = defineEmits<{
  select: [kind: AddMoreItemKind];
}>();

const { t } = useI18n();
const open = ref(false);
const menuRoot = ref<HTMLElement | null>(null);
const triggerButton = ref<HTMLElement | null>(null);
const menuPanel = ref<HTMLElement | null>(null);
const panelStyle = reactive({
  left: "0px",
  top: "0px",
  maxHeight: "none",
});

async function toggleMenu(): Promise<void> {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    positionMenuPanel();
  }
}

function select(kind: AddMoreItemKind): void {
  open.value = false;
  emit("select", kind);
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (
    isEventOutsideElement(event, menuRoot.value) &&
    isEventOutsideElement(event, menuPanel.value)
  ) {
    open.value = false;
  }
}

function onWindowGeometryChange(): void {
  if (open.value) positionMenuPanel();
}

function positionMenuPanel(): void {
  const trigger = triggerButton.value;
  const panel = menuPanel.value;
  if (!trigger || !panel) return;

  const triggerRect = trigger.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const position = calculateAddMoreMenuPosition({
    triggerRect,
    panelRect: {
      width: panelRect.width,
      height: panel.scrollHeight,
    },
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  panelStyle.left = `${position.left}px`;
  panelStyle.top = `${position.top}px`;
  panelStyle.maxHeight = `${position.maxHeight}px`;
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown, true);
  window.addEventListener("resize", onWindowGeometryChange);
  window.addEventListener("scroll", onWindowGeometryChange, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown, true);
  window.removeEventListener("resize", onWindowGeometryChange);
  window.removeEventListener("scroll", onWindowGeometryChange, true);
});
</script>

<template>
  <div
    ref="menuRoot"
    class="relative justify-self-start"
    :class="{ 'z-[90]': open }"
  >
    <button
      class="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-200 px-3 text-sm font-bold text-sky-700 hover:bg-slate-300/70"
      type="button"
      :aria-expanded="open"
      aria-haspopup="menu"
      ref="triggerButton"
      @click="toggleMenu"
    >
      <Plus class="size-4" />
      <span>{{ t("editor.addMore") }}</span>
      <ChevronDown class="size-4" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuPanel"
        class="fixed z-[1000] w-52 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
        :style="panelStyle"
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
    </Teleport>
  </div>
</template>
