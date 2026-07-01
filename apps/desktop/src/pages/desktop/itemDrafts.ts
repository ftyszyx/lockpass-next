import type {
  VaultItemField,
  VaultItemFieldKind,
  VaultItemType,
} from "@lockpass/core";
import type { AttachmentDraft } from "@/stores/vault/types";
import { fieldLabel, isSensitiveField } from "./formatters";
import type { AddMoreMenuItem, AttachmentDraftBlock } from "./types";

type Translate = (key: string) => string;
type ExtraFieldKind = "password" | "date" | "totp" | "note";

export const CARD_CONTACT_FIELD_LABEL_KEYS = {
  issuer: "editor.cardIssuer",
  phoneLocal: "editor.cardPhoneLocal",
  phoneTollFree: "editor.cardPhoneTollFree",
  phoneInternational: "editor.cardPhoneInternational",
  website: "editor.cardWebsite",
} as const;

export type CardContactFieldKey = keyof typeof CARD_CONTACT_FIELD_LABEL_KEYS;

export const CARD_CONTACT_FIELD_KEYS = Object.keys(
  CARD_CONTACT_FIELD_LABEL_KEYS,
) as CardContactFieldKey[];

const CARD_CONTACT_FIELD_KINDS = new Set<VaultItemFieldKind>(["phone", "text"]);

export function buildDefaultDraftFields(
  t: Translate,
  type: VaultItemType,
): VaultItemField[] {
  if (type === "payment-card") {
    return [
      makeDraftField(t, "cardholder"),
      makeDraftField(t, "card-number", "", true),
      makeDraftField(t, "expiry"),
      makeDraftField(t, "cvv", "", true),
      makeDraftField(t, "secret", "", true),
      makeCardContactField(t, "issuer"),
      makeCardContactField(t, "phoneLocal"),
      makeCardContactField(t, "phoneTollFree"),
      makeCardContactField(t, "phoneInternational"),
      makeCardContactField(t, "website"),
    ];
  }

  if (type === "secure-note" || type === "attachment") return [];

  return [
    makeDraftField(t, "url"),
    makeDraftField(t, "username"),
    makeDraftField(t, "password", "", true),
  ];
}

export function makeDraftField(
  t: Translate,
  kind: VaultItemFieldKind,
  value = "",
  sensitive = isSensitiveField(kind),
  label = fieldLabel(t, kind),
): VaultItemField {
  return {
    id: `field-${crypto.randomUUID()}`,
    kind,
    label,
    value,
    sensitive,
  };
}

export function makeCardContactField(
  t: Translate,
  key: CardContactFieldKey,
  value = "",
): VaultItemField {
  return makeDraftField(
    t,
    key.startsWith("phone") ? "phone" : "text",
    value,
    false,
    t(CARD_CONTACT_FIELD_LABEL_KEYS[key]),
  );
}

export function isCardContactDraftField(field: VaultItemField): boolean {
  return CARD_CONTACT_FIELD_KINDS.has(field.kind) && !field.sensitive;
}

export function normalizeDraftFieldsForSave(
  fields: VaultItemField[],
): VaultItemField[] {
  return fields.map((field) => normalizeDraftFieldForSave(field));
}

export function makeAttachmentDraftBlock(
  attachments: AttachmentDraft[] = [],
): AttachmentDraftBlock {
  return {
    id: `attachment-block-${crypto.randomUUID()}`,
    attachments,
  };
}

export function flattenAttachmentDraftBlocks(
  blocks: AttachmentDraftBlock[],
): AttachmentDraft[] {
  return blocks.flatMap((block) => block.attachments);
}

export function getAddMoreMenuItems(
  t: Translate,
  _type: VaultItemType,
): AddMoreMenuItem[] {
  return [
    { kind: "group", label: t("editor.addGroup") },
    { kind: "password", label: t("editor.addPassword") },
    { kind: "date", label: t("editor.addDate") },
    { kind: "totp", label: t("editor.addTotp") },
    { kind: "attachment", label: t("detail.attachments") },
    { kind: "note", label: t("editor.notes") },
  ];
}

export function appendExtraDraftField(
  t: Translate,
  fields: VaultItemField[],
  kind: ExtraFieldKind | "group",
): VaultItemField[] {
  if (kind === "group") {
    return [...fields, makeDraftGroupField(t)];
  }

  const field = makeDraftField(
    t,
    kind,
    kind === "date" ? todayDateValue() : "",
    isSensitiveField(kind),
  );
  return [
    ...fields,
    { ...field, id: `optional-field-${kind}-${crypto.randomUUID()}` },
  ];
}

export function isTotpField(field: VaultItemField): boolean {
  return field.kind === "totp";
}

export function isOptionalDraftField(field: VaultItemField): boolean {
  return field.id.startsWith("optional-field-");
}

export function isUserEditableDraftField(field: VaultItemField): boolean {
  return isOptionalDraftField(field) || isCardContactDraftField(field);
}

export function makeDraftGroupField(t: Translate): VaultItemField {
  return {
    id: `optional-field-group-${crypto.randomUUID()}`,
    kind: "group",
    label: t("fields.group"),
    value: "",
    sensitive: false,
    collapsed: false,
    children: [
      {
        ...makeDraftField(t, "text", "", false),
        id: `optional-field-group-child-${crypto.randomUUID()}`,
      },
    ],
  };
}

export function toggleDraftGroupCollapsed(
  fields: VaultItemField[],
  groupId: string,
): VaultItemField[] {
  return fields.map((field) =>
    field.id === groupId && field.kind === "group"
      ? { ...field, collapsed: !field.collapsed }
      : field,
  );
}

export function reorderDraftFieldsByDrop(
  fields: VaultItemField[],
  draggedFieldId: string,
  targetFieldId: string,
  placement: "before" | "after" = "before",
): VaultItemField[] {
  if (draggedFieldId === targetFieldId) return fields;

  const draggedIndex = fields.findIndex((field) => field.id === draggedFieldId);
  const targetIndex = fields.findIndex((field) => field.id === targetFieldId);
  if (draggedIndex < 0 || targetIndex < 0) return fields;

  const nextFields = [...fields];
  const [draggedField] = nextFields.splice(draggedIndex, 1);
  const adjustedTargetIndex = nextFields.findIndex(
    (field) => field.id === targetFieldId,
  );
  const insertIndex =
    placement === "after" ? adjustedTargetIndex + 1 : adjustedTargetIndex;
  nextFields.splice(insertIndex, 0, draggedField);
  return nextFields;
}

function todayDateValue(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeDraftFieldForSave(field: VaultItemField): VaultItemField {
  const { collapsed: _collapsed, children, ...savedField } = field;
  const normalizedChildren = children?.map(normalizeDraftFieldForSave) ?? [];
  return normalizedChildren.length
    ? { ...savedField, children: normalizedChildren }
    : savedField;
}
