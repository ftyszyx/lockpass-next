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
import type {
  VaultItemField,
  VaultItemFieldKind,
  VaultItemType,
} from "@lockpass/core";
import { PasswordInput } from "@lockpass/ui";
import { computed, onBeforeUnmount, reactive } from "vue";
import { useI18n } from "vue-i18n";
import Draggable from "vuedraggable";
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
  isAttachmentDraftField,
  isOptionalDraftField,
  isUserEditableDraftField,
  replaceDraftFieldSubset,
} from "../itemDrafts";
import AddMoreMenu from "./AddMoreMenu.vue";
import ImagePreviewModal from "./ImagePreviewModal.vue";

interface DraggableMoveEvent {
  draggedContext?: {
    element?: VaultItemField;
  };
}

const props = defineProps<{
  editingItemId: string | null;
  pickingType: boolean;
  draft: ItemDraft;
  uploadingFiles: boolean;
  error: string;
  vaultSessionId: string | null;
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
  removeGroupChild: [groupId: string, childId: string];
  toggleGroup: [id: string];
  generateField: [field: VaultItemField];
  addWebsite: [];
  addExtra: [kind: AddMoreItemKind];
  addGroupChild: [
    groupId: string,
    kind: Exclude<AddMoreItemKind, "group" | "attachment">,
  ];
}>();

const { t } = useI18n();
const fieldDragOptions = {
  itemKey: "id",
  handle: ".drag-handle",
  ghostClass: "vault-field-ghost",
  chosenClass: "vault-field-chosen",
  dragClass: "vault-field-drag",
  animation: 180,
  scroll: true,
  bubbleScroll: true,
  scrollSensitivity: 72,
  scrollSpeed: 12,
  forceFallback: true,
  fallbackOnBody: true,
} as const;
const sortableWebsiteFields = computed({
  get: () => props.draft.fields.filter(isWebsiteField),
  set: (fields) => replaceDraftFieldSubsetInDraft(isWebsiteField, fields),
});
const sortableMainFields = computed({
  get: () => props.draft.fields.filter(isMainField),
  set: (fields) => replaceDraftFieldSubsetInDraft(isMainField, fields),
});
const addMoreItems = computed(() => getAddMoreMenuItems(t, props.draft.type));
const groupAddMoreItems = computed(() =>
  addMoreItems.value.filter(
    (item) => item.kind !== "group" && item.kind !== "attachment",
  ),
);
const needsEditorScrollBuffer = computed(
  () =>
    props.draft.fields.length > 3 ||
    props.draft.fields.some(
      (field) => field.kind === "group" || field.kind === "attachment",
    ),
);
const editorContentClasses = computed(() => [
  "grid gap-3",
  needsEditorScrollBuffer.value ? "pb-24" : "pb-2",
]);
const preview = reactive({
  visible: false,
  loading: false,
  error: "",
  fileName: "",
  url: "",
});

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
  return (
    field.kind === "group" ||
    isOptionalDraftField(field) ||
    field.kind === "totp"
  );
}

function canDragField(field: VaultItemField): boolean {
  if (field.kind === "group") return true;
  if (props.draft.type === "login" && field.kind === "url") {
    return sortableWebsiteFields.value.length > 1 && isUserEditableDraftField(field);
  }
  return isUserEditableDraftField(field);
}

function isGroupField(field: VaultItemField): boolean {
  return field.kind === "group";
}

function groupChildren(field: VaultItemField): VaultItemField[] {
  field.children ??= [];
  return field.children;
}

function attachmentBlock(field: VaultItemField) {
  return props.draft.attachmentBlocks.find((block) => block.id === field.value);
}

function fieldLabelEditable(field: VaultItemField): boolean {
  return isGroupField(field) || isUserEditableDraftField(field);
}

function fieldTitleRowClasses(field: VaultItemField): string {
  return canDragField(field)
    ? "grid-cols-[24px_minmax(0,1fr)_auto]"
    : "grid-cols-[minmax(0,1fr)_auto]";
}

function addGroupChild(groupId: string, kind: AddMoreItemKind): void {
  if (kind === "group" || kind === "attachment") return;
  emit("addGroupChild", groupId, kind);
}

function isWebsiteField(field: VaultItemField): boolean {
  return field.kind === "url";
}

function isMainField(field: VaultItemField): boolean {
  if (props.draft.type === "login" && field.kind === "url") return false;
  return true;
}

function replaceDraftFieldSubsetInDraft(
  predicate: (field: VaultItemField) => boolean,
  fields: VaultItemField[],
): void {
  props.draft.fields = replaceDraftFieldSubset(
    props.draft.fields,
    predicate,
    fields,
  );
}

function canMoveFieldDrag(event: DraggableMoveEvent): boolean {
  const field = event.draggedContext?.element;
  return Boolean(field && canDragField(field));
}

async function previewImage(
  attachment: ItemDraft["attachments"][number],
): Promise<void> {
  if (!isImageAttachment(attachment)) return;
  if (!props.vaultSessionId || !props.keyId) return;

  revokePreviewUrl();
  preview.visible = true;
  preview.loading = true;
  preview.error = "";
  preview.fileName = attachment.fileName;

  try {
    const blob = await loadAttachmentFile(
      attachment,
      props.vaultSessionId,
      props.keyId,
    );
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

onBeforeUnmount(() => {
  revokePreviewUrl();
});
</script>

<template>
  <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/40">
    <section
      class="flex max-h-[92vh] w-[580px] max-w-[94vw] flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-2xl"
    >
      <template v-if="pickingType">
        <div class="relative min-h-0 overflow-auto p-5">
          <button
            class="icon-button absolute right-4 top-4 bg-white"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
          <h3 class="mb-5 mt-2 text-center text-xl font-black">
            {{ t("editor.pickTypeTitle") }}
          </h3>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="type in editorTypes"
              :key="type"
              class="grid min-h-24 content-center justify-items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-left hover:border-sky-300 hover:ring-4 hover:ring-sky-100"
              type="button"
              @click="emit('pickType', type)"
            >
              <span
                class="grid size-9 place-items-center rounded-lg bg-slate-100 text-teal-700"
              >
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
        <div
          class="grid min-h-14 grid-cols-[44px_minmax(0,1fr)_44px] items-center border-b border-slate-200 bg-white"
        >
          <button
            v-if="!editingItemId"
            class="icon-button ml-2"
            type="button"
            :title="t('editor.backToTypes')"
            @click="emit('backToTypes')"
          >
            <ArrowLeft class="size-4" />
          </button>
          <span v-else></span>
          <h3 class="text-center font-bold">
            {{ editingItemId ? t("editor.editTitle") : t("editor.newTitle") }}
          </h3>
          <button
            class="icon-button mr-2 justify-self-end"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="min-h-0 overflow-auto p-4">
          <div :class="editorContentClasses">
            <div class="grid grid-cols-[52px_minmax(0,1fr)] items-center gap-3">
              <span
                class="grid size-[52px] place-items-center rounded-lg bg-teal-100 text-teal-800"
              >
                <component :is="itemTypeIcon(draft.type)" class="size-6" />
              </span>
              <input
                v-model="draft.title"
                class="min-h-11 rounded-lg border-2 border-slate-200 bg-white px-3 text-base font-semibold text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                :placeholder="typeLabel(t, draft.type)"
              />
            </div>

            <template v-if="draft.type === 'login'">
              <div class="grid gap-2">
                <span class="text-xs font-bold text-slate-500">{{
                  t("fields.url")
                }}</span>
                <Draggable
                  v-model="sortableWebsiteFields"
                  v-bind="fieldDragOptions"
                  class="vault-field-list grid gap-2"
                  :move="canMoveFieldDrag"
                >
                  <template #item="{ element: field, index }">
                    <div
                      class="grid grid-cols-[24px_minmax(0,1fr)_34px] items-center gap-2 rounded-lg bg-slate-100 p-2 transition"
                    >
                      <button
                        class="drag-handle grid size-6 cursor-grab touch-none select-none place-items-center rounded-md text-slate-500 hover:bg-white active:cursor-grabbing"
                        type="button"
                        :title="t('editor.dragField')"
                        :aria-label="t('editor.dragField')"
                      >
                        <GripVertical class="size-4" />
                      </button>
                      <label class="grid gap-1">
                        <span
                          v-if="!fieldLabelEditable(field)"
                          class="text-xs font-bold text-slate-500"
                          >{{
                            index === 0 ? t("fields.url") : t("editor.website")
                          }}</span
                        >
                        <input
                          v-else
                          v-model="field.label"
                          class="min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs font-bold text-slate-700 outline-none hover:border-slate-200 focus:border-sky-300 focus:bg-white"
                          :placeholder="draftFieldLabel(field)"
                        />
                        <input
                          v-model="field.value"
                          class="border-0 bg-transparent text-sm outline-none"
                          :placeholder="t('editor.websitePlaceholder')"
                        />
                      </label>
                      <button
                        v-if="sortableWebsiteFields.length > 1"
                        class="icon-button text-rose-600"
                        type="button"
                        @click="emit('removeField', field.id)"
                      >
                        <CircleMinus class="size-4" />
                      </button>
                    </div>
                  </template>
                </Draggable>
                <button
                  class="plain-button justify-self-start border-0 bg-transparent text-sky-700"
                  type="button"
                  @click="emit('addWebsite')"
                >
                  <Plus class="size-4" />
                  {{ t("editor.addWebsite") }}
                </button>
              </div>
            </template>

            <label v-if="draft.type === 'secure-note'" class="form-label">
              <span class="flex items-center justify-between gap-3">
                <span>
                  {{ t("editor.notes") }}
                  <span class="required-mark" :title="t('editor.required')"
                    >*</span
                  >
                </span>
              </span>
              <textarea
                v-model="draft.notes"
                class="form-input min-h-20"
              ></textarea>
            </label>

            <Draggable
              v-model="sortableMainFields"
              v-bind="fieldDragOptions"
              class="vault-field-list grid gap-4"
              :move="canMoveFieldDrag"
            >
              <template #item="{ element: field }">
                <div class="grid gap-2 rounded-lg transition">
                  <template v-if="isGroupField(field)">
                    <div
                      class="overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                    >
                      <div
                        class="grid min-h-11 grid-cols-[24px_28px_minmax(0,1fr)_34px] items-center gap-2 border-b border-slate-200 p-2"
                      >
                        <button
                          class="drag-handle grid size-6 cursor-grab touch-none select-none place-items-center rounded-md text-slate-500 hover:bg-white active:cursor-grabbing"
                          type="button"
                          :title="t('editor.dragField')"
                          :aria-label="t('editor.dragField')"
                        >
                          <GripVertical class="size-4" />
                        </button>
                        <button
                          class="grid size-7 place-items-center rounded-md text-slate-500 hover:bg-white"
                          type="button"
                          :title="
                            field.collapsed
                              ? t('editor.expandGroup')
                              : t('editor.collapseGroup')
                          "
                          :aria-label="
                            field.collapsed
                              ? t('editor.expandGroup')
                              : t('editor.collapseGroup')
                          "
                          @click="emit('toggleGroup', field.id)"
                        >
                          <ChevronDown
                            class="size-4 transition"
                            :class="{ '-rotate-90': field.collapsed }"
                          />
                        </button>
                        <input
                          v-model="field.label"
                          class="min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-700 outline-none hover:border-slate-200 focus:border-sky-300 focus:bg-white"
                          :placeholder="t('fields.group')"
                        />
                        <button
                          class="icon-button text-rose-600"
                          type="button"
                          @click="emit('removeField', field.id)"
                        >
                          <CircleMinus class="size-4" />
                        </button>
                      </div>
                      <div v-if="!field.collapsed" class="grid gap-3 p-3">
                        <Draggable
                          :list="groupChildren(field)"
                          v-bind="fieldDragOptions"
                          class="vault-field-list grid gap-3"
                          :move="canMoveFieldDrag"
                        >
                          <template #item="{ element: child }">
                            <div
                              class="grid gap-2 rounded-lg bg-white p-2 transition"
                            >
                              <div
                                class="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 text-xs font-bold text-slate-500"
                              >
                                <button
                                  class="drag-handle grid size-6 cursor-grab touch-none select-none place-items-center rounded-md text-slate-500 hover:bg-slate-100 active:cursor-grabbing"
                                  type="button"
                                  :title="t('editor.dragField')"
                                  :aria-label="t('editor.dragField')"
                                >
                                  <GripVertical class="size-4" />
                                </button>
                                <input
                                  v-model="child.label"
                                  class="min-w-0 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-700 outline-none hover:border-slate-200 focus:border-sky-300 focus:bg-white"
                                  :placeholder="draftFieldLabel(child)"
                                />
                                <button
                                  class="text-xs font-semibold text-slate-500 hover:text-rose-600"
                                  type="button"
                                  @click="
                                    emit(
                                      'removeGroupChild',
                                      field.id,
                                      child.id,
                                    )
                                  "
                                >
                                  {{ t("editor.removeOptionalField") }}
                                </button>
                              </div>
                              <div
                                v-if="isGeneratedField(child.kind)"
                                class="grid grid-cols-[1fr_auto] gap-2"
                              >
                                <PasswordInput
                                  v-model="child.value"
                                  class="form-input"
                                  :show-label="t('user.showPassword')"
                                  :hide-label="t('user.hidePassword')"
                                />
                                <button
                                  class="plain-button"
                                  type="button"
                                  @click="emit('generateField', child)"
                                >
                                  <WandSparkles class="size-4" />
                                  {{ t("editor.generate") }}
                                </button>
                              </div>
                              <input
                                v-else-if="child.kind === 'date'"
                                v-model="child.value"
                                class="form-input"
                                type="date"
                              />
                              <input
                                v-else-if="child.kind === 'totp'"
                                v-model="child.value"
                                class="form-input"
                                autocomplete="off"
                                :placeholder="t('editor.totpPlaceholder')"
                              />
                              <textarea
                                v-else-if="child.kind === 'note'"
                                v-model="child.value"
                                class="form-input min-h-20"
                              ></textarea>
                              <PasswordInput
                                v-else-if="child.sensitive"
                                v-model="child.value"
                                class="form-input"
                                :show-label="t('user.showPassword')"
                                :hide-label="t('user.hidePassword')"
                              />
                              <input
                                v-else
                                v-model="child.value"
                                class="form-input"
                              />
                            </div>
                          </template>
                        </Draggable>
                        <AddMoreMenu
                          context="group"
                          :items="groupAddMoreItems"
                          @select="addGroupChild(field.id, $event)"
                        />
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div
                      class="grid items-center gap-2 text-xs font-bold text-slate-500"
                      :class="fieldTitleRowClasses(field)"
                    >
                      <button
                        v-if="canDragField(field)"
                        class="drag-handle grid size-6 cursor-grab touch-none select-none place-items-center rounded-md text-slate-500 hover:bg-white active:cursor-grabbing"
                        type="button"
                        :title="t('editor.dragField')"
                        :aria-label="t('editor.dragField')"
                      >
                        <GripVertical class="size-4" />
                      </button>
                      <span v-if="!fieldLabelEditable(field)">
                        {{ draftFieldLabel(field) }}
                        <span
                          v-if="isRequiredField(field)"
                          class="required-mark"
                          :title="t('editor.required')"
                          >*</span
                        >
                      </span>
                      <input
                        v-else
                        v-model="field.label"
                        class="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-slate-700 outline-none hover:border-slate-200 focus:border-sky-300 focus:bg-white"
                        :placeholder="draftFieldLabel(field)"
                      />
                      <button
                        v-if="canRemoveField(field)"
                        class="text-xs font-semibold text-slate-500 hover:text-rose-600"
                        type="button"
                        @click="emit('removeField', field.id)"
                      >
                        {{ t("editor.removeOptionalField") }}
                      </button>
                      <span v-else></span>
                    </div>
                    <template v-if="isAttachmentDraftField(field)">
                    <div
                      v-if="attachmentBlock(field)"
                      class="grid gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <strong>{{ t("editor.uploadTitle") }}</strong>
                          <span class="block text-xs text-slate-500">{{
                            t("editor.uploadHint")
                          }}</span>
                        </div>
                        <label class="plain-button">
                          <Upload class="size-4" />
                          {{
                            uploadingFiles
                              ? t("app.loading")
                              : t("editor.upload")
                          }}
                          <input
                            class="hidden"
                            type="file"
                            multiple
                            :disabled="uploadingFiles"
                            @change="
                              emit('filesSelected', {
                                blockId: field.value,
                                event: $event,
                              })
                            "
                          />
                        </label>
                      </div>
                      <div class="grid gap-2">
                        <div
                          v-if="!attachmentBlock(field)?.attachments.length"
                          class="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"
                        >
                          <span class="file-icon"
                            ><Paperclip class="size-4"
                          /></span>
                          <span
                            ><strong class="block">{{
                              t("editor.noDraftAttachments")
                            }}</strong
                            ><small class="text-slate-500">{{
                              t("editor.draftHint")
                            }}</small></span
                          >
                        </div>
                        <div
                          v-for="attachment in attachmentBlock(field)
                            ?.attachments ?? []"
                          :key="attachment.id"
                          class="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"
                          :class="{
                            'cursor-pointer hover:border-teal-200 hover:bg-teal-50/40':
                              isImageAttachment(attachment),
                          }"
                          @click="previewImage(attachment)"
                        >
                          <span class="file-icon">{{
                            attachmentIcon(attachment)
                          }}</span>
                          <span class="min-w-0">
                            <strong class="block truncate">{{
                              attachment.fileName
                            }}</strong>
                            <small class="text-slate-500"
                              >{{ attachmentKind(t, attachment) }} /
                              {{ formatFileSize(attachment.sizeBytes) }}</small
                            >
                          </span>
                          <span class="flex items-center gap-1">
                            <button
                              v-if="isImageAttachment(attachment)"
                              class="icon-button"
                              :title="t('attachment.previewImage')"
                              @click.stop="previewImage(attachment)"
                            >
                              <Image class="size-4" />
                            </button>
                            <button
                              class="icon-button"
                              @click.stop="
                                emit('removeAttachment', attachment.id)
                              "
                            >
                              <X class="size-4" />
                            </button>
                          </span>
                        </div>
                      </div>
                    </div>
                    </template>
                    <div
                      v-else-if="isGeneratedField(field.kind)"
                      class="grid grid-cols-[1fr_auto] gap-2"
                    >
                      <PasswordInput
                        v-model="field.value"
                        class="form-input"
                        :show-label="t('user.showPassword')"
                        :hide-label="t('user.hidePassword')"
                      />
                      <button
                        class="plain-button"
                        type="button"
                        @click="emit('generateField', field)"
                      >
                        <WandSparkles class="size-4" />
                        {{ t("editor.generate") }}
                      </button>
                    </div>
                    <input
                      v-else-if="field.kind === 'date'"
                      v-model="field.value"
                      class="form-input"
                      type="date"
                    />
                    <input
                      v-else-if="field.kind === 'totp'"
                      v-model="field.value"
                      class="form-input"
                      autocomplete="off"
                      :placeholder="t('editor.totpPlaceholder')"
                    />
                    <textarea
                      v-else-if="field.kind === 'note'"
                      v-model="field.value"
                      class="form-input min-h-20"
                    ></textarea>
                    <PasswordInput
                      v-else-if="field.sensitive"
                      v-model="field.value"
                      class="form-input"
                      :show-label="t('user.showPassword')"
                      :hide-label="t('user.hidePassword')"
                    />
                    <input v-else v-model="field.value" class="form-input" />
                  </template>
                </div>
              </template>
            </Draggable>
            <AddMoreMenu
              :items="addMoreItems"
              @select="emit('addExtra', $event)"
            />

            <p
              v-if="error"
              class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
            >
              {{ error }}
            </p>
          </div>
        </div>

        <div
          class="flex justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3"
        >
          <button class="plain-button" @click="emit('close')">
            {{ t("editor.cancel") }}
          </button>
          <button
            class="primary-button"
            :disabled="!draft.vaultId || uploadingFiles"
            @click="emit('save')"
          >
            <Save class="size-4" />{{ t("editor.save") }}
          </button>
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

<style scoped>
.vault-field-list > [data-draggable="true"] {
  transition:
    opacity 160ms ease,
    transform 180ms ease,
    box-shadow 160ms ease;
}

.vault-field-ghost {
  opacity: 0.45;
}

.vault-field-chosen {
  box-shadow: 0 10px 28px rgb(15 23 42 / 14%);
}

.vault-field-drag {
  cursor: grabbing;
}
</style>
