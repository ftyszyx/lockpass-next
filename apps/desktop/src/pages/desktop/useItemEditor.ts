import {
  generatePassword,
  type VaultAttachment,
  type VaultItem,
  type VaultItemField,
  type VaultItemType,
} from "@lockpass/core";
import { reactive, ref, type Ref } from "vue";
import { fieldsWithoutRedundantLegacyNote } from "@/services/legacyImportRepair";
import { saveAttachmentFile } from "@/services/vaultRepository";
import type { AttachmentDraft, SaveItemPayload } from "@/stores/vault/types";
import {
  appendDraftGroupChildField,
  appendExtraDraftField,
  buildDefaultDraftFields,
  flattenAttachmentDraftBlocks,
  hydrateAttachmentDraftFields,
  makeAttachmentDraftField,
  makeAttachmentDraftBlock,
  makeDraftField,
  makeExtraWebsiteDraftField,
  normalizeDraftFieldsForSave,
  removeDraftGroupChildField,
  toggleDraftGroupCollapsed,
  updateDraftFieldValueById,
  type ExtraFieldKind,
} from "./itemDrafts";
import type {
  AddMoreItemKind,
  DrawerName,
  ItemDraft,
  ModalName,
  PasswordOptions,
} from "./types";

type Translate = (key: string, params?: Record<string, unknown>) => string;

interface ItemEditorStore {
  activeUserId: string | null;
  selectedVaultId: "all" | string;
  requireVaultSession(): { sessionId: string; keyId: string };
  saveItem(input: SaveItemPayload): Promise<VaultItem>;
  selectItem(itemId: string): void;
}

interface UseItemEditorInput {
  activeDrawer: Ref<DrawerName>;
  activeModal: Ref<ModalName>;
  selectedItem: Ref<VaultItem | null | undefined>;
  selectedItemAttachments: Ref<VaultAttachment[]>;
  showToast(message: string): void;
  t: Translate;
  vaultStore: ItemEditorStore;
  writableVaults: Ref<Array<{ id: string }>>;
}

export function useItemEditor(input: UseItemEditorInput) {
  const passwordOptions = reactive<PasswordOptions>({
    length: 18,
    lowercase: true,
    uppercase: true,
    numbers: true,
    symbols: true,
    symbolCount: 1,
    avoidAmbiguous: false,
  });
  const generatedPassword = ref(generatePassword(passwordOptions));
  const itemDraft = reactive<ItemDraft>({
    type: "login",
    vaultId: "",
    title: "",
    notes: "",
    fields: [],
    attachments: [],
    attachmentBlocks: [],
  });
  const pickingItemType = ref(false);
  const editingItemId = ref<string | null>(null);
  const passwordTargetFieldId = ref<string | null>(null);
  const uploadingFiles = ref(false);
  const itemError = ref("");

  function resetItemDraft(): void {
    editingItemId.value = null;
    passwordTargetFieldId.value = null;
    itemError.value = "";
    itemDraft.type = "login";
    itemDraft.vaultId = "";
    itemDraft.title = "";
    itemDraft.notes = "";
    itemDraft.fields = [];
    itemDraft.attachments = [];
    itemDraft.attachmentBlocks = [];
    pickingItemType.value = false;
  }

  function openNewItem(type?: VaultItemType): void {
    const itemType = type ?? "login";
    editingItemId.value = null;
    itemError.value = "";
    pickingItemType.value = type === undefined;
    itemDraft.type = itemType;
    itemDraft.vaultId =
      input.vaultStore.selectedVaultId === "all"
        ? (input.writableVaults.value[0]?.id ?? "")
        : input.vaultStore.selectedVaultId;
    itemDraft.title = "";
    itemDraft.notes = "";
    itemDraft.fields = buildDefaultDraftFields(input.t, itemType);
    itemDraft.attachments = [];
    itemDraft.attachmentBlocks = [];
    input.activeModal.value = "item";
  }

  function startNewItem(type: VaultItemType): void {
    openNewItem(type);
    pickingItemType.value = false;
  }

  function openEditItem(): void {
    const item = input.selectedItem.value;
    if (!item) return;

    itemError.value = "";
    pickingItemType.value = false;
    editingItemId.value = item.id;
    itemDraft.type = item.type;
    itemDraft.vaultId = item.vaultId;
    itemDraft.title = item.title;
    itemDraft.notes = item.notes;
    const urlFields = item.urls.map((url) =>
      makeDraftField(input.t, "url", url, false, input.t("fields.url")),
    );
    const draftFields = [
      ...urlFields,
      ...fieldsWithoutRedundantLegacyNote(item),
    ].map((field) => ({
      ...field,
    }));
    const attachmentDrafts = input.selectedItemAttachments.value.map(
      (attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        checksumSha256: attachment.checksumSha256,
        encryptedBlobRef: attachment.encryptedBlobRef,
        state: attachment.state,
      }),
    );
    itemDraft.attachments = attachmentDrafts;
    const hydrated = hydrateAttachmentDraftFields(
      input.t,
      draftFields,
      attachmentDrafts,
    );
    itemDraft.fields = hydrated.fields;
    itemDraft.attachmentBlocks = hydrated.attachmentBlocks;
    input.activeModal.value = "item";
  }

  function backToItemTypePicker(): void {
    editingItemId.value = null;
    itemError.value = "";
    pickingItemType.value = true;
  }

  function addDraftAttachmentBlock(): void {
    const block = makeAttachmentDraftBlock();
    itemDraft.attachmentBlocks = [...itemDraft.attachmentBlocks, block];
    itemDraft.fields = [
      ...itemDraft.fields,
      makeAttachmentDraftField(input.t, block.id),
    ];
  }

  function removeDraftAttachmentBlock(id: string): void {
    itemDraft.attachmentBlocks = itemDraft.attachmentBlocks.filter(
      (block) => block.id !== id,
    );
    itemDraft.fields = itemDraft.fields.filter(
      (field) => !(field.kind === "attachment" && field.value === id),
    );
    syncDraftAttachments();
  }

  function addWebsiteField(): void {
    if (itemDraft.type !== "login") return;
    itemDraft.fields = [
      ...itemDraft.fields,
      makeExtraWebsiteDraftField(input.t),
    ];
  }

  function addTotpField(): void {
    itemDraft.fields = appendExtraDraftField(input.t, itemDraft.fields, "totp");
  }

  function addDraftExtra(kind: AddMoreItemKind): void {
    if (kind === "attachment") {
      addDraftAttachmentBlock();
      return;
    }
    if (kind === "group") {
      itemDraft.fields = appendExtraDraftField(input.t, itemDraft.fields, kind);
      return;
    }
    itemDraft.fields = appendExtraDraftField(input.t, itemDraft.fields, kind);
  }

  function addDraftGroupChild(groupId: string, kind: ExtraFieldKind): void {
    itemDraft.fields = appendDraftGroupChildField(
      input.t,
      itemDraft.fields,
      groupId,
      kind,
    );
  }

  function openPasswordGenerator(target: VaultItemField): void {
    passwordTargetFieldId.value = target.id;
    generatedPassword.value = generatePassword(passwordOptions);
    input.activeDrawer.value = "generator";
  }

  function openStandalonePasswordGenerator(): void {
    passwordTargetFieldId.value = null;
    input.activeDrawer.value = "generator";
  }

  function clearPasswordTarget(): void {
    passwordTargetFieldId.value = null;
  }

  function useGeneratedPassword(): void {
    const targetId = passwordTargetFieldId.value;
    if (!targetId) return;

    itemDraft.fields = updateDraftFieldValueById(
      itemDraft.fields,
      targetId,
      generatedPassword.value,
    );
    input.activeDrawer.value = null;
    passwordTargetFieldId.value = null;
  }

  function removeDraftField(id: string): void {
    const field = itemDraft.fields.find((candidate) => candidate.id === id);
    if (field?.kind === "attachment") {
      removeDraftAttachmentBlock(field.value);
      return;
    }

    itemDraft.fields = itemDraft.fields.filter((field) => field.id !== id);
  }

  function removeDraftGroupChild(groupId: string, childId: string): void {
    itemDraft.fields = removeDraftGroupChildField(
      itemDraft.fields,
      groupId,
      childId,
    );
  }

  function toggleDraftGroup(id: string): void {
    itemDraft.fields = toggleDraftGroupCollapsed(itemDraft.fields, id);
  }

  async function saveItem(): Promise<void> {
    const validationError = validateItemDraft();
    if (validationError) {
      itemError.value = validationError;
      return;
    }

    const isEditing = editingItemId.value !== null;
    const saved = await input.vaultStore.saveItem({
      editingItemId: editingItemId.value,
      type: itemDraft.type,
      vaultId: itemDraft.vaultId,
      title: itemDraft.title,
      notes: itemDraft.type === "secure-note" ? itemDraft.notes : "",
      fields: normalizeDraftFieldsForSave(
        itemDraft.fields,
        itemDraft.attachmentBlocks,
      ),
      attachments: flattenAttachmentDraftBlocks(itemDraft.attachmentBlocks),
    });

    input.activeModal.value = null;
    editingItemId.value = null;
    itemError.value = "";
    input.showToast(
      input.t(isEditing ? "toast.itemUpdated" : "toast.itemCreated"),
    );
    input.vaultStore.selectItem(saved.id);
  }

  async function onFilesSelected(payload: {
    blockId: string;
    event: Event;
  }): Promise<void> {
    const { blockId, event } = payload;
    const inputElement = event.target as HTMLInputElement;
    const files = Array.from(inputElement.files ?? []);
    if (files.length === 0) return;

    uploadingFiles.value = true;
    try {
      const vaultSession = input.vaultStore.requireVaultSession();
      const activeUserId = input.vaultStore.activeUserId;
      if (!activeUserId) throw new Error("active-user-required");
      const drafts = await Promise.all(
        files.map(async (file) => {
          const id = `attachment-${crypto.randomUUID()}`;
          const saved = await saveAttachmentFile(
            activeUserId,
            id,
            file,
            vaultSession.sessionId,
            vaultSession.keyId,
          );
          return {
            id,
            fileName: file.name,
            mimeType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            checksumSha256: saved.checksumSha256,
            encryptedBlobRef: saved.encryptedBlobRef,
            state: "available" as const,
            previewFile: file,
          };
        }),
      );

      itemDraft.attachmentBlocks = itemDraft.attachmentBlocks.map((block) =>
        block.id === blockId
          ? { ...block, attachments: [...block.attachments, ...drafts] }
          : block,
      );
      syncDraftAttachments();
      input.showToast(input.t("toast.filesSelected", { count: drafts.length }));
    } finally {
      inputElement.value = "";
      uploadingFiles.value = false;
    }
  }

  function removeDraftAttachment(id: string): void {
    itemDraft.attachmentBlocks = itemDraft.attachmentBlocks.map((block) => ({
      ...block,
      attachments: block.attachments.filter(
        (attachment) => attachment.id !== id,
      ),
    }));
    syncDraftAttachments();
  }

  function regeneratePassword(): void {
    generatedPassword.value = generatePassword(passwordOptions);
  }

  function validateItemDraft(): string {
    if (!itemDraft.vaultId || !itemDraft.title.trim())
      return input.t("editor.requiredMissing");

    if (itemDraft.type === "login" && !fieldValue("password"))
      return input.t("editor.requiredMissing");
    if (itemDraft.type === "payment-card" && !fieldValue("card-number"))
      return input.t("editor.requiredMissing");
    if (itemDraft.type === "secure-note" && !itemDraft.notes.trim())
      return input.t("editor.requiredMissing");
    return "";
  }

  function fieldValue(kind: VaultItemField["kind"]): string {
    return (
      itemDraft.fields.find((field) => field.kind === kind)?.value.trim() ?? ""
    );
  }

  function syncDraftAttachments(): void {
    itemDraft.attachments = flattenAttachmentDraftBlocks(
      itemDraft.attachmentBlocks,
    ) as AttachmentDraft[];
  }

  return {
    addDraftExtra,
    addDraftGroupChild,
    addWebsiteField,
    backToItemTypePicker,
    clearPasswordTarget,
    editingItemId,
    generatedPassword,
    itemDraft,
    itemError,
    onFilesSelected,
    openEditItem,
    openNewItem,
    openPasswordGenerator,
    openStandalonePasswordGenerator,
    passwordOptions,
    passwordTargetFieldId,
    pickingItemType,
    regeneratePassword,
    removeDraftAttachment,
    removeDraftAttachmentBlock,
    removeDraftField,
    removeDraftGroupChild,
    resetItemDraft,
    saveItem,
    startNewItem,
    toggleDraftGroup,
    uploadingFiles,
    useGeneratedPassword,
  };
}
