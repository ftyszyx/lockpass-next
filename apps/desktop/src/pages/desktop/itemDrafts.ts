import type {
  VaultItemField,
  VaultItemFieldKind,
  VaultItemType,
} from "@lockpass/core";
import type { AttachmentDraft } from "@/stores/vault";
import { fieldLabel, isSensitiveField } from "./formatters";
import type { AddMoreMenuItem, AttachmentDraftBlock } from "./types";

type Translate = (key: string) => string;

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
  return fields.map((field) => ({ ...field }));
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
  type: VaultItemType,
): AddMoreMenuItem[] {
  const sharedItems: AddMoreMenuItem[] = [
    { kind: "attachment", label: t("detail.attachments") },
    { kind: "note", label: t("editor.notes") },
  ];

  if (type === "login") {
    return [
      { kind: "totp", label: t("editor.addTotp") },
      ...sharedItems,
    ];
  }

  return sharedItems;
}

export function appendExtraDraftField(
  t: Translate,
  fields: VaultItemField[],
  kind: "totp" | "note",
): VaultItemField[] {
  return [
    ...fields,
    makeDraftField(t, kind, "", kind === "totp"),
  ];
}

export function isTotpField(field: VaultItemField): boolean {
  return field.kind === "totp";
}
