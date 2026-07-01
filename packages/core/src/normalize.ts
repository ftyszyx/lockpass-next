import { CORE_SCHEMA_VERSION } from "./types";
import type {
  LockPassId,
  VaultItem,
  VaultItemField,
  VaultItemFieldKind,
  VaultItemType
} from "./types";

export type VaultItemFieldInput = Omit<Partial<VaultItemField>, "children"> & {
  kind: VaultItemFieldKind;
  value?: string | null;
  children?: readonly VaultItemFieldInput[];
};

export type VaultItemInput = Omit<
  VaultItem,
  "schemaVersion" | "title" | "subtitle" | "notes" | "urls" | "tags" | "fields"
> & {
  schemaVersion?: VaultItem["schemaVersion"];
  title?: string | null;
  subtitle?: string | null;
  notes?: string | null;
  urls?: readonly (string | null | undefined)[];
  tags?: readonly (string | null | undefined)[];
  fields?: readonly VaultItemFieldInput[];
};

const DEFAULT_FIELD_LABELS: Record<VaultItemFieldKind, string> = {
  username: "Username",
  password: "Password",
  url: "Website",
  totp: "One-time password",
  email: "Email",
  phone: "Phone",
  text: "Text",
  group: "Group",
  date: "Date",
  secret: "Secret",
  note: "Note",
  attachment: "Attachments",
  cardholder: "Cardholder",
  "card-number": "Card number",
  expiry: "Expiry",
  cvv: "Security code",
  "recovery-code": "Recovery code"
};

const DEFAULT_TYPE_TITLES: Record<VaultItemType, string> = {
  login: "Untitled login",
  "secure-note": "Untitled note",
  "payment-card": "Untitled card",
  attachment: "Untitled attachment",
  identity: "Untitled identity",
  "recovery-code": "Untitled recovery code"
};

const SENSITIVE_FIELD_KINDS = new Set<VaultItemFieldKind>([
  "password",
  "totp",
  "secret",
  "cvv",
  "recovery-code"
]);

export function normalizeVaultItem(input: VaultItemInput): VaultItem {
  const title = normalizeSingleLineText(input.title) || DEFAULT_TYPE_TITLES[input.type];

  return {
    ...input,
    schemaVersion: input.schemaVersion ?? CORE_SCHEMA_VERSION,
    title,
    subtitle: normalizeSingleLineText(input.subtitle),
    notes: normalizeMultilineText(input.notes),
    urls: normalizeUrlList(input.urls ?? []),
    tags: normalizeTags(input.tags ?? []),
    fields: normalizeItemFields(input.fields ?? [])
  };
}

export function normalizeItemFields(fields: readonly VaultItemFieldInput[]): VaultItemField[] {
  const seenIds = new Set<LockPassId>();

  return fields
    .map((field, index) => normalizeItemField(field, index, seenIds))
    .filter((field) => field.value.length > 0 || hasChildFields(field));
}

export function normalizeItemField(
  field: VaultItemFieldInput,
  index = 0,
  seenIds: Set<LockPassId> = new Set()
): VaultItemField {
  const id = ensureUniqueId(
    normalizeSingleLineText(field.id) || `field-${index + 1}`,
    seenIds
  );
  const label = normalizeSingleLineText(field.label) || DEFAULT_FIELD_LABELS[field.kind];
  const rawValue = normalizeFieldValue(field.kind, field.value);
  const children =
    field.kind === "group" ? normalizeItemFields(field.children ?? []) : [];

  const normalized: VaultItemField = {
    id,
    kind: field.kind,
    label,
    value: field.kind === "group" ? "" : rawValue,
    sensitive: field.sensitive ?? SENSITIVE_FIELD_KINDS.has(field.kind)
  };
  if (children.length > 0) normalized.children = children;
  return normalized;
}

export function normalizeTags(tags: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const normalizedTags: string[] = [];

  for (const tag of tags) {
    const normalized = normalizeSingleLineText(tag).toLowerCase();

    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedTags.push(normalized);
  }

  return normalizedTags;
}

export function normalizeUrlList(urls: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const normalizedUrls: string[] = [];

  for (const url of urls) {
    const normalized = normalizeUrlValue(url);

    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    normalizedUrls.push(normalized);
  }

  return normalizedUrls;
}

function normalizeFieldValue(kind: VaultItemFieldKind, value: string | null | undefined): string {
  if (kind === "note") {
    return normalizeMultilineText(value);
  }

  if (kind === "url") {
    return normalizeUrlValue(value);
  }

  return normalizeSingleLineText(value);
}

function normalizeSingleLineText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeMultilineText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function normalizeUrlValue(value: string | null | undefined): string {
  const trimmed = normalizeSingleLineText(value);

  if (trimmed.length === 0) {
    return "";
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

function ensureUniqueId(candidate: LockPassId, seenIds: Set<LockPassId>): LockPassId {
  let id = candidate;
  let suffix = 2;

  while (seenIds.has(id)) {
    id = `${candidate}-${suffix}`;
    suffix += 1;
  }

  seenIds.add(id);
  return id;
}

function hasChildFields(field: VaultItemField): boolean {
  return (field.children?.length ?? 0) > 0;
}
