<script setup lang="ts">
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  CreditCard,
  GripVertical,
  Image,
  KeyRound,
  Paperclip,
  Plus,
  Save,
  StickyNote,
  Upload,
  WandSparkles,
  X,
  CircleMinus,
} from "@lucide/vue";
import type { VaultItemField, VaultItemFieldKind, VaultItemType } from "@lockpass/core";
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { loadAttachmentFile } from "@/services/vaultRepository";
import {
  attachmentIcon,
  attachmentKind,
  fieldDisplayLabel,
  formatFileSize,
  isImageAttachment,
  typeLabel,
} from "../formatters";
import { editorTypes, type AddMoreItemKind, type ItemDraft } from "../types";
import {
  getAddMoreMenuItems,
  isCardContactDraftField,
  isOptionalDraftField,
  isUserEditableDraftField,
} from "../itemDrafts";
import AddMoreMenu from "./AddMoreMenu.vue";
import ImagePreviewModal from "./ImagePreviewModal.vue";

const props = defineProps<{
  editingItemId: string | null;
  pickingType: boolean;
  draft: ItemDraft;
  uploadingFiles: boolean;
  error: string;
  vaultKey: Uint8Array | null;
  keyId: string | null;
}>();

const emit = defineEmits<{
  close: [];
  save: [];
  pickType: [type: VaultItemType];
  importChoice: [];
  backToTypes: [];
  filesSelected: [payload: { blockId: string; event: Event }];
  removeAttachment: [id: string];
  removeAttachmentBlock: [id: string];
  removeField: [id: string];
  moveField: [
    draggedId: string,
    targetId: string,
    placement: "before" | "after",
  ];
  toggleGroup: [id: string];
  generateField: [field: VaultItemField];
  addWebsite: [];
  addExtra: [kind: AddMoreItemKind];
}>();

const { t } = useI18n();
const FIELD_DRAG_MIME = "application/x-lockpass-field-id";
const websiteFields = computed(() => props.draft.fields.filter((field) => field.kind === "url"));
const cardContactFields = computed(() => props.draft.fields.filter(isCardContactDraftField));
const mainFields = computed(() =>
  props.draft.fields.filter((field) => {
    if (props.draft.type === "login" && field.kind === "url") return false;
    if (props.draft.type === "payment-card" && isCardContactDraftField(field)) return false;
    return true;
  }),
);
const addMoreItems = computed(() => getAddMoreMenuItems(t, props.draft.type));
const preview = reactive({
  visible: false,
  loading: false,
  error: "",
  fileName: "",
  url: "",
});
const draggingFieldId = ref<string | null>(null);

function isRequiredField(field: VaultItemField): boolean {
  if (props.draft.type === "login") {
    return field.kind === "password" && !isOptionalDraftField(field);
  }
  if (props.draft.type === "payment-card") return field.kind === "card-number";
  return false;
}

function isGeneratedField(kind: VaultItemFieldKind): boolean {
  return ["password", "secret", "recovery-code"].includes(kind);
}

function itemTypeIcon(type: VaultItemType) {
  if (type === "payment-card") return CreditCard;
  if (type === "secure-note") return StickyNote;
  return KeyRound;
}

function draftFieldLabel(field: VaultItemField): string {
  return fieldDisplayLabel(t, field);
}

function canRemoveField(field: VaultItemField): boolean {
  return field.kind === "group" || isOptionalDraftField(field) || field.kind === "totp";
}

function canMoveField(field: VaultItemField): boolean {
  if (field.kind === "group") return true;
  if (props.draft.type === "login" && field.kind === "url") {
    return websiteFields.value.length > 1;
  }
  return isUserEditableDraftField(field);
}

function isGroupField(field: VaultItemField): boolean {
  return field.kind === "group";
}

function groupChildren(field: VaultItemField): VaultItemField[] {
  return field.children ?? [];
}

function fieldLabelEditable(field: VaultItemField): boolean {
  return isGroupField(field) || isUserEditableDraftField(field);
}

function fieldDragClasses(field: VaultItemField): Record<string, boolean> {
  const isDragging = draggingFieldId.value === field.id;
  const isDropTarget = Boolean(
    draggingFieldId.value &&
      draggingFieldId.value !== field.id &&
      canMoveField(field),
  );
  return {
    "opacity-50": isDragging,
    "ring-2 ring-sky-200 bg-white": isDropTarget,
  };
}

function startFieldDrag(field: VaultItemField, event: DragEvent): void {
  if (!canMoveField(field)) return;
  draggingFieldId.value = field.id;
  event.dataTransfer?.setData(FIELD_DRAG_MIME, field.id);
  event.dataTransfer?.setData("text/plain", field.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function dragFieldOver(field: VaultItemField, event: DragEvent): void {
  if (!canMoveField(field) || draggingFieldId.value === field.id) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function dropFieldOn(field: VaultItemField, event: DragEvent): void {
  if (!canMoveField(field)) return;

  event.preventDefault();
  const draggedId =
    draggingFieldId.value ?? event.dataTransfer?.getData(FIELD_DRAG_MIME);
  const placement = fieldDropPlacement(event);
  draggingFieldId.value = null;

  if (!draggedId || draggedId === field.id) return;
  emit("moveField", draggedId, field.id, placement);
}

function endFieldDrag(): void {
  draggingFieldId.value = null;
}

function fieldDropPlacement(event: DragEvent): "before" | "after" {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return "before";

  const rect = target.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

async function previewImage(attachment: ItemDraft["attachments"][number]): Promise<void> {
  if (!isImageAttachment(attachment)) return;
  if (!props.vaultKey || !props.keyId) return;

  revokePreviewUrl();
  preview.visible = true;
  preview.loading = true;
  preview.error = "";
  preview.fileName = attachment.fileName;

  try {
    const blob = await loadAttachmentFile(attachment, props.vaultKey, props.keyId);
    preview.url = URL.createObjectURL(blob);
  } catch (error) {
    preview.error = error instanceof Error ? error.message : String(error);
  } finally {
    preview.loading = false;
  }
}

function closePreview(): void {
  preview.visible = false;
  preview.fileName = "";
  preview.error = "";
  revokePreviewUrl();
}

function revokePreviewUrl(): void {
  if (!preview.url) return;
  URL.revokeObjectURL(preview.url);
  preview.url = "";
}

onBeforeUnmount(revokePreviewUrl);
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40">
    <section class="flex max-h-[92vh] w-[580px] max-w-[94vw] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-2xl">
      <template v-if="pickingType">
        <div class="relative min-h-0 overflow-auto p-5">
          <button class="icon-button absolute right-4 top-4 bg-white" @click="emit('close')">
            <X class="size-4" />
          </button>
          <h3 class="mb-5 mt-2 text-center text-xl font-black">{{ t("editor.pickTypeTitle") }}</h3>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="type in editorTypes"
              :key="type"
              class="grid min-h-24 content-center justify-items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-sky-300 hover:ring-4 hover:ring-sky-100"
              type="button"
              @click="emit('pickType', type)"
            >
              <span class="grid size-9 place-items-center rounded-lg bg-slate-100 text-teal-700">
                <component :is="itemTypeIcon(type)" class="size-5" />
              </span>
              <strong>{{ typeLabel(t, type) }}</strong>
            </button>
          </div>
          <div class="mt-4 border-t border-slate-200 pt-3">
            <button
              class="grid min-h-10 w-full grid-cols-[minmax(0,1fr)_auto] items-center rounded-lg px-3 text-left text-sm font-bold text-slate-700 hover:bg-white"
              type="button"
              @click="emit('importChoice')"
            >
              <span>{{ t("editor.importItems") }}</span>
              <ArrowRight class="size-4 text-slate-500" />
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="grid min-h-14 grid-cols-[44px_minmax(0,1fr)_44px] items-center border-b border-slate-200 bg-white">
          <button v-if="!editingItemId" class="icon-button ml-2" type="button" :title="t('editor.backToTypes')" @click="emit('backToTypes')">
            <ArrowLeft class="size-4" />
          </button>
          <span v-else></span>
          <h3 class="text-center font-bold">{{ editingItemId ? t("editor.editTitle") : t("editor.newTitle") }}</h3>
          <button class="icon-button mr-2 justify-self-end" @click="emit('close')"><X class="size-4" /></button>
        </div>

        <div class="min-h-0 overflow-auto p-4">
          <div class="grid gap-4">
            <div class="grid grid-cols-[60px_minmax(0,1fr)] items-center gap-4">
              <span class="grid size-[60px] place-items-center rounded-lg bg-teal-100 text-teal-800">
                <component :is="itemTypeIcon(draft.type)" class="size-7" />
              </span>
              <input v-model="draft.title" class="min-h-12 rounded-lg border-[3px] border-sky-200 bg-white px-3 text-xl font-black outline-none focus:border-sky-300" :placeholder="typeLabel(t, draft.type)" />
            </div>

            <template v-if="draft.type === 'login'">
              <div class="grid gap-2">
                <span class="text-xs font-bold text-slate-500">{{ t("fields.url") }}</span>
                <div
                  v-for="(field, index) in websiteFields"
                  :key="field.id"
                  class="grid grid-cols-[24px_minmax(0,1fr)_34px] items-center gap-2 rounded-lg bg-slate-100 p-2 transition"
                  :class="fieldDragClasses(field)"
                  @dragover="dragFieldOver(field, $event)"
                  @drop="dropFieldOn(field, $event)"
                >
                  <button
                    class="grid size-6 cursor-grab place-items-center rounded-md text-slate-500 hover:bg-white active:cursor-grabbing"
                    type="button"
                    draggable="true"
                    :title="t('editor.dragField')"
                    :aria-label="t('editor.dragField')"
                    @dragstart="startFieldDrag(field, $event)"
                    @dragend="endFieldDrag"
                  >
                    <GripVertical class="size-4" />
                  </button>
                  <label class="grid gap-1">
                    <span class="text-xs font-bold text-slate-500">{{ index === 0 ? t("fields.url") : t("editor.website") }}</span>
                    <input v-model="field.value" class="border-0 bg-transparent text-sm outline-none" :placeholder="t('editor.websitePlaceholder')" />
                  </label>
                  <button v-if="websiteFields.length > 1" class="icon-button text-rose-600" type="button" @click="emit('removeField', field.id)">
                    <CircleMinus class="size-4" />
                  </button>
                </div>
                <button class="plain-button justify-self-start border-0 bg-transparent text-sky-700" type="button" @click="emit('addWebsite')">
                  <Plus class="size-4" />
                  {{ t("editor.addWebsite") }}
                </button>
              </div>
            </template>

            <template v-for="field in mainFields" :key="field.id">
              <div
                class="grid gap-2 rounded-lg transition"
                :class="fieldDragClasses(field)"
                @dragover="dragFieldOver(field, $event)"
                @drop="dropFieldOn(field, $event)"
              >
                <template v-if="isGroupField(field)">
                  <div class="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    <div class="grid min-h-11 grid-cols-[24px_28px_minmax(0,1fr)_34px] items-center gap-2 border-b border-slate-200 p-2">
                      <button
                        class="grid size-6 cursor-grab place-items-center rounded-md text-slate-500 hover:bg-white active:cursor-grabbing"
                        type="button"
                        draggable="true"
                        :title="t('editor.dragField')"
                        :aria-label="t('editor.dragField')"
                        @dragstart="startFieldDrag(field, $event)"
                        @dragend="endFieldDrag"
                      >
                        <GripVertical class="size-4" />
                      </button>
                      <button
                        class="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-white"
                        type="button"
                        :title="field.collapsed ? t('editor.expandGroup') : t('editor.collapseGroup')"
                        :aria-label="field.collapsed ? t('editor.expandGroup') : t('editor.collapseGroup')"
                        @click="emit('toggleGroup', field.id)"
                      >
                        <ChevronDown class="size-4 transition" :class="{ '-rotate-90': field.collapsed }" />
                      </button>
                      <input
                        v-model="field.label"
                        class="min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-700 outline-none hover:border-slate-200 focus:border-sky-300 focus:bg-white"
                        :placeholder="t('fields.group')"
                      />
                      <button class="icon-button text-rose-600" type="button" @click="emit('removeField', field.id)">
                        <CircleMinus class="size-4" />
                      </button>
                    </div>
                    <div v-if="!field.collapsed" class="grid gap-3 p-3">
                      <label
                        v-for="child in groupChildren(field)"
                        :key="child.id"
                        class="grid gap-2 text-xs font-bold text-slate-500"
                      >
                        <input
                          v-model="child.label"
                          class="min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-700 outline-none hover:border-slate-200 focus:border-sky-300 focus:bg-white"
                          :placeholder="draftFieldLabel(child)"
                        />
                        <div v-if="isGeneratedField(child.kind)" class="grid grid-cols-[1fr_auto] gap-2">
                          <input v-model="child.value" class="form-input" />
                          <button class="plain-button" type="button" @click="emit('generateField', child)">
                            <WandSparkles class="size-4" />
                            {{ t("editor.generate") }}
                          </button>
                        </div>
                        <input v-else-if="child.kind === 'date'" v-model="child.value" class="form-input" type="date" />
                        <input v-else-if="child.kind === 'totp'" v-model="child.value" class="form-input" autocomplete="off" :placeholder="t('editor.totpPlaceholder')" />
                        <textarea v-else-if="child.kind === 'note'" v-model="child.value" class="form-input min-h-20"></textarea>
                        <input v-else v-model="child.value" class="form-input" />
                      </label>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div class="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 text-xs font-bold text-slate-500">
                    <button
                      v-if="canMoveField(field)"
                      class="grid size-6 cursor-grab place-items-center rounded-md text-slate-500 hover:bg-white active:cursor-grabbing"
                      type="button"
                      draggable="true"
                      :title="t('editor.dragField')"
                      :aria-label="t('editor.dragField')"
                      @dragstart="startFieldDrag(field, $event)"
                      @dragend="endFieldDrag"
                    >
                      <GripVertical class="size-4" />
                    </button>
                    <span v-else></span>
                    <span v-if="!fieldLabelEditable(field)">
                      {{ draftFieldLabel(field) }}
                      <span v-if="isRequiredField(field)" class="required-mark" :title="t('editor.required')">*</span>
                    </span>
                    <input
                      v-else
                      v-model="field.label"
                      class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-700 outline-none hover:border-slate-200 focus:border-sky-300 focus:bg-white"
                      :placeholder="draftFieldLabel(field)"
                    />
                    <button v-if="canRemoveField(field)" class="text-xs font-semibold text-slate-500 hover:text-rose-600" type="button" @click="emit('removeField', field.id)">
                      {{ t("editor.removeOptionalField") }}
                    </button>
                    <span v-else></span>
                  </div>
                  <div v-if="isGeneratedField(field.kind)" class="grid grid-cols-[1fr_auto] gap-2">
                    <input v-model="field.value" class="form-input" />
                    <button class="plain-button" type="button" @click="emit('generateField', field)">
                      <WandSparkles class="size-4" />
                      {{ t("editor.generate") }}
                    </button>
                  </div>
                  <input v-else-if="field.kind === 'date'" v-model="field.value" class="form-input" type="date" />
                  <input v-else-if="field.kind === 'totp'" v-model="field.value" class="form-input" autocomplete="off" :placeholder="t('editor.totpPlaceholder')" />
                  <textarea v-else-if="field.kind === 'note'" v-model="field.value" class="form-input min-h-20"></textarea>
                  <input v-else v-model="field.value" class="form-input" />
                </template>
              </div>
            </template>

            <div v-if="draft.type === 'payment-card' && cardContactFields.length" class="form-label">
              <span>{{ t("editor.contactInfo") }}</span>
              <div class="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <div
                  v-for="field in cardContactFields"
                  :key="field.id"
                  class="grid min-h-14 grid-cols-[24px_minmax(0,1fr)_34px] items-center gap-2 border-b border-slate-200 p-2 transition last:border-b-0"
                  :class="fieldDragClasses(field)"
                  @dragover="dragFieldOver(field, $event)"
                  @drop="dropFieldOn(field, $event)"
                >
                  <button
                    class="grid size-6 cursor-grab place-items-center rounded-md text-slate-600 hover:bg-white active:cursor-grabbing"
                    type="button"
                    draggable="true"
                    :title="t('editor.dragField')"
                    :aria-label="t('editor.dragField')"
                    @dragstart="startFieldDrag(field, $event)"
                    @dragend="endFieldDrag"
                  >
                    <GripVertical class="size-4" />
                  </button>
                  <label class="grid gap-0.5">
                    <input
                      v-model="field.label"
                      class="rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-700 outline-none hover:border-slate-200 focus:border-sky-300 focus:bg-white"
                      :placeholder="draftFieldLabel(field)"
                    />
                    <input v-model="field.value" class="border-0 bg-transparent text-sm outline-none" :placeholder="t('fields.text')" />
                  </label>
                  <button class="icon-button text-rose-600" type="button" @click="emit('removeField', field.id)">
                    <CircleMinus class="size-4" />
                  </button>
                </div>
              </div>
            </div>

            <label v-if="draft.type === 'secure-note'" class="form-label">
              <span class="flex items-center justify-between gap-3">
                <span>
                  {{ t("editor.notes") }}
                  <span class="required-mark" :title="t('editor.required')">*</span>
                </span>
              </span>
              <textarea v-model="draft.notes" class="form-input min-h-20"></textarea>
            </label>

            <div v-for="block in draft.attachmentBlocks" :key="block.id" class="grid gap-2">
              <span class="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                <span>{{ t("detail.attachments") }}</span>
                <button class="text-xs font-semibold text-slate-500 hover:text-rose-600" type="button" @click="emit('removeAttachmentBlock', block.id)">
                  {{ t("editor.removeOptionalField") }}
                </button>
              </span>
              <div class="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <strong>{{ t("editor.uploadTitle") }}</strong>
                    <span class="block text-xs text-slate-500">{{ t("editor.uploadHint") }}</span>
                  </div>
                  <label class="plain-button">
                    <Upload class="size-4" />
                    {{ uploadingFiles ? t("app.loading") : t("editor.upload") }}
                    <input class="hidden" type="file" multiple :disabled="uploadingFiles" @change="emit('filesSelected', { blockId: block.id, event: $event })" />
                  </label>
                </div>
                <div class="grid gap-2">
                  <div v-if="!block.attachments.length" class="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-slate-200 bg-white p-2">
                    <span class="file-icon"><Paperclip class="size-4" /></span>
                    <span><strong class="block">{{ t("editor.noDraftAttachments") }}</strong><small class="text-slate-500">{{ t("editor.draftHint") }}</small></span>
                  </div>
                  <div
                    v-for="attachment in block.attachments"
                    :key="attachment.id"
                    class="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"
                    :class="{ 'cursor-pointer hover:border-teal-200 hover:bg-teal-50/40': isImageAttachment(attachment) }"
                    @click="previewImage(attachment)"
                  >
                    <span class="file-icon">{{ attachmentIcon(attachment) }}</span>
                    <span class="min-w-0">
                      <strong class="block truncate">{{ attachment.fileName }}</strong>
                      <small class="text-slate-500">{{ attachmentKind(t, attachment) }} / {{ formatFileSize(attachment.sizeBytes) }}</small>
                    </span>
                    <span class="flex items-center gap-1">
                      <button v-if="isImageAttachment(attachment)" class="icon-button" :title="t('attachment.previewImage')" @click.stop="previewImage(attachment)">
                        <Image class="size-4" />
                      </button>
                      <button class="icon-button" @click.stop="emit('removeAttachment', attachment.id)"><X class="size-4" /></button>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <AddMoreMenu :items="addMoreItems" @select="emit('addExtra', $event)" />

            <p v-if="error" class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{{ error }}</p>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-slate-200 bg-white p-4">
          <button class="plain-button" @click="emit('close')">{{ t("editor.cancel") }}</button>
          <button class="primary-button" :disabled="!draft.vaultId || uploadingFiles" @click="emit('save')"><Save class="size-4" />{{ t("editor.save") }}</button>
        </div>
      </template>
    </section>

    <ImagePreviewModal
      :visible="preview.visible"
      :title="preview.fileName"
      :url="preview.url"
      :loading="preview.loading"
      :error="preview.error"
      :loading-text="t('app.loading')"
      @close="closePreview"
    />
  </div>
</template>
