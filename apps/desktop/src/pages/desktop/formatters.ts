import type {
  VaultAttachment,
  VaultItem,
  VaultItemField,
  VaultItemFieldKind,
  VaultItemType,
} from "@lockpass/core";

type Translate = (key: string) => string;

export function getInitials(value: string): string {
  const clean = value.trim();
  if (!clean) return "LP";
  if (clean.includes("@")) {
    const emailName = clean.split("@")[0]?.replace(/[^a-z0-9]/gi, "") ?? "";
    if (emailName) return emailName.slice(0, 2).toUpperCase();
  }
  const asciiWords = clean.match(/[a-z0-9]+/gi);
  if (asciiWords?.length) {
    return asciiWords
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

export function typeLabel(t: Translate, type: VaultItemType | "all"): string {
  const labels: Record<string, string> = {
    all: t("filters.all"),
    login: t("type.login"),
    "payment-card": t("type.card"),
    "secure-note": t("type.note"),
    attachment: t("type.attachment"),
    identity: t("type.identity"),
    "recovery-code": t("type.recoveryCode"),
  };
  return labels[type] ?? t("type.login");
}

export function fieldLabel(
  t: Translate,
  kind: VaultItemFieldKind,
  fallback = "",
): string {
  const labels: Record<VaultItemFieldKind, string> = {
    username: t("fields.username"),
    password: t("fields.password"),
    url: t("fields.url"),
    totp: t("fields.totp"),
    email: t("fields.email"),
    phone: t("fields.phone"),
    text: t("fields.text"),
    secret: t("fields.secret"),
    note: t("fields.note"),
    cardholder: t("fields.cardholder"),
    "card-number": t("fields.cardNumber"),
    expiry: t("fields.expiry"),
    cvv: t("fields.cvv"),
    "recovery-code": t("fields.recoveryCode"),
  };
  return labels[kind] || fallback;
}

export function itemIconText(item: VaultItem): string {
  if (item.type === "payment-card") return "CARD";
  if (item.type === "secure-note") return "NOTE";
  if (item.type === "attachment") return "FILE";
  return item.title.slice(0, 2).toUpperCase();
}

export function displayValue(
  field: VaultItemField,
  showSensitive: boolean,
): string {
  if (field.sensitive && !showSensitive) return "\u2022".repeat(16);
  return field.value;
}

export function detailFields(t: Translate, item: VaultItem): VaultItemField[] {
  const urlFields = item.urls.map((url, index) => ({
    id: `url-${index}`,
    kind: "url" as VaultItemFieldKind,
    label: fieldLabel(t, "url"),
    value: url,
    sensitive: false,
  }));
  return [
    ...urlFields,
    ...item.fields.filter((field) => field.kind !== "note"),
  ];
}

export function defaultItemTitle(t: Translate, type: VaultItemType): string {
  if (type === "payment-card") return t("type.card");
  if (type === "secure-note") return t("type.note");
  if (type === "attachment") return t("type.attachment");
  return t("type.login");
}

export function defaultFields(
  t: Translate,
  type: VaultItemType,
): VaultItemField[] {
  if (type === "payment-card") {
    return [
      makeField(t, "cardholder"),
      makeField(t, "card-number", "", true),
      makeField(t, "expiry"),
      makeField(t, "cvv", "", true),
      makeField(t, "secret", "", true),
    ];
  }

  if (type === "secure-note" || type === "attachment") return [];

  return [
    makeField(t, "url"),
    makeField(t, "username"),
    makeField(t, "password", "", true),
  ];
}

export function makeField(
  t: Translate,
  kind: VaultItemFieldKind,
  value = "",
  sensitive = isSensitiveField(kind),
): VaultItemField {
  return {
    id: `field-${crypto.randomUUID()}`,
    kind,
    label: fieldLabel(t, kind),
    value,
    sensitive,
  };
}

export function isSensitiveField(kind: VaultItemFieldKind): boolean {
  return ["password", "totp", "secret", "cvv", "recovery-code"].includes(kind);
}

export function attachmentKind(
  t: Translate,
  attachment: Pick<VaultAttachment, "fileName" | "mimeType">,
): string {
  const name = attachment.fileName.toLowerCase();
  if (isImageAttachment(attachment)) return t("attachment.image");
  if (/\.(zip|7z|rar|tar|gz|tgz)$/.test(name)) return t("attachment.archive");
  if (/\.pdf$/.test(name)) return t("attachment.pdf");
  return t("attachment.file");
}

export function attachmentIcon(
  attachment: Pick<VaultAttachment, "fileName" | "mimeType">,
): string {
  const name = attachment.fileName.toLowerCase();
  if (isImageAttachment(attachment)) return "IMG";
  if (/\.(zip|7z|rar|tar|gz|tgz)$/.test(name)) return "ZIP";
  if (/\.pdf$/.test(name)) return "PDF";
  return "FILE";
}

export function isImageAttachment(
  attachment: Pick<VaultAttachment, "fileName" | "mimeType">,
): boolean {
  const name = attachment.fileName.toLowerCase();
  return (
    (attachment.mimeType || "").startsWith("image/") ||
    /\.(png|jpe?g|jfif|webp|gif|bmp|heic|avif|svg)$/.test(name)
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
