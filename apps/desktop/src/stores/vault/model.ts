import type {
  SyncMetadata,
  Vault,
  VaultAttachment,
  VaultItem,
  VaultItemField,
  VaultItemType,
} from "@lockpass/core";
import { desktopMessages, supportedLocales, type SupportedLocale } from "@/i18n";
import { configuredOfficialApiUrl } from "@/services/appConfig";
import { DEFAULT_SHORTCUT_SETTINGS, normalizeShortcutSettings } from "@/services/shortcuts";
import { normalizeSyncServerUrl } from "@/services/syncClient";
import type { ExternalImportItem } from "@/services/backup";
import type {
  DesktopLayoutSettings,
  DesktopLoggingSettings,
  DesktopLogLevel,
  DesktopSecuritySettings,
  DesktopShortcutSettings,
  DesktopSyncSettings,
  DesktopUserProfile,
  DesktopVaultStoreData,
} from "@/services/vaultRepository";
import type { AttachmentDraft } from "./types";
import type { DesktopVaultPayload } from "@/services/masterPassword";

export const CORE_SCHEMA_VERSION = 1;
export const DESKTOP_STORE_SCHEMA_VERSION = 2;
export const DEFAULT_LAYOUT: DesktopLayoutSettings = {
  sidebarWidth: 236,
  itemListWidth: 358,
};
export const DEFAULT_LOGGING_SETTINGS: DesktopLoggingSettings = {
  level: "error",
};
export const DEFAULT_SHORTCUTS: DesktopShortcutSettings = DEFAULT_SHORTCUT_SETTINGS;
export const DEFAULT_SECURITY_SETTINGS: DesktopSecuritySettings = {
  startOnLogin: false,
  autoLockOnLimit: true,
  autoLockDelaySeconds: 300,
};
export const LEGACY_DEFAULT_SELF_HOST_SYNC_SERVER_URL = "http://127.0.0.1:1480";
export const DEFAULT_SYNC_SETTINGS: DesktopSyncSettings = {
  mode: "official",
  serverUrl: "",
  syncSpaceId: null,
  accountId: null,
  accountLabel: null,
  deviceId: null,
  cursor: 0,
  connectedAt: null,
  lastSyncAt: null,
};

export interface NormalizedLoadedData {
  data: DesktopVaultStoreData;
  legacyPayloads: Record<string, DesktopVaultPayload>;
  hasLegacyPlaintext: boolean;
}

export function normalizeLoadedData(
  data: DesktopVaultStoreData | null,
  systemLocale: SupportedLocale,
): NormalizedLoadedData {
  const locale = isSupportedLocale(data?.settings?.locale)
    ? data.settings.locale
    : systemLocale;
  const normalizedUsers = normalizeUsers(data);
  const users = normalizedUsers.users;
  const activeUserId = users.some((user) => user.id === data?.activeUserId)
    ? data?.activeUserId ?? null
    : users[0]?.id ?? null;
  const activeUser = users.find((user) => user.id === activeUserId) ?? null;

  return {
    data: {
      schemaVersion: DESKTOP_STORE_SCHEMA_VERSION,
      activeUserId,
      users,
      settings: {
        locale,
        deviceId: data?.settings?.deviceId || `device-${crypto.randomUUID()}`,
        layout: normalizeLayout(data?.settings?.layout),
        logging: normalizeLoggingSettings(data?.settings?.logging),
        shortcuts: normalizeShortcutSettings(data?.settings?.shortcuts),
        security: normalizeSecuritySettings(data?.settings?.security),
        sync: syncSettingsForUser(activeUser, data?.settings?.sync),
      },
    },
    legacyPayloads: normalizedUsers.legacyPayloads,
    hasLegacyPlaintext: normalizedUsers.hasLegacyPlaintext,
  };
}

export function ensurePayloadHasVault(
  payload: DesktopVaultPayload,
  deviceId: string,
  locale: SupportedLocale,
): DesktopVaultPayload {
  if (payload.vaults.length > 0) return payload;

  const vault = createDefaultVault(deviceId, locale);
  return {
    vaults: [vault],
    items: payload.items.map((item) => ({
      ...item,
      vaultId: vault.id,
    })),
    attachments: payload.attachments.map((attachment) => ({
      ...attachment,
      vaultId: vault.id,
    })),
  };
}

export function normalizeUserProfile(
  user: DesktopUserProfile,
): DesktopUserProfile {
  const cryptoConfig = normalizeUserCrypto(user.crypto ?? null);
  const isLegacySetupPlaceholder =
    !cryptoConfig &&
    user.username === "local" &&
    (user.displayName === "\u672c\u5730\u7528\u6237" ||
      user.displayName === "Local user");

  return {
    id: user.id || `user-${crypto.randomUUID()}`,
    username: isLegacySetupPlaceholder ? "" : user.username,
    displayName: isLegacySetupPlaceholder ? "" : user.displayName,
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: user.updatedAt || new Date().toISOString(),
    sync: user.sync ? normalizeSyncSettings(user.sync) : null,
    crypto: cryptoConfig ?? null,
  };
}

export function stripFastUnlockFromUser(
  user: DesktopUserProfile,
): DesktopUserProfile {
  if (!user.crypto?.fastUnlock) return user;

  return {
    ...user,
    crypto: {
      ...user.crypto,
      fastUnlock: null,
    },
  };
}

export function backupUserProfile(
  user: DesktopUserProfile,
): DesktopUserProfile {
  const cryptoConfig = user.crypto
    ? {
        ...user.crypto,
        fastUnlock: null,
      }
    : null;

  return {
    ...user,
    sync: { ...DEFAULT_SYNC_SETTINGS },
    crypto: cryptoConfig,
  };
}

export function snapshotActiveUser(
  users: DesktopUserProfile[],
  activeUserId: string | null,
  sync: DesktopSyncSettings,
): DesktopUserProfile[] {
  if (!activeUserId) return users;

  const now = new Date().toISOString();
  return users.map((user) =>
    user.id === activeUserId
      ? {
          ...user,
          sync: normalizeSyncSettings(sync),
          updatedAt: now,
        }
      : user,
  );
}

export function syncSettingsForUser(
  user: DesktopUserProfile | null,
  fallback?: Partial<DesktopSyncSettings> | null,
): DesktopSyncSettings {
  return normalizeSyncSettings(user?.sync ?? fallback);
}

export function normalizeUsername(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
  return normalized || `user-${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeLayout(
  layout: Partial<DesktopLayoutSettings> | null | undefined,
): DesktopLayoutSettings {
  return {
    sidebarWidth: clampNumber(
      layout?.sidebarWidth,
      190,
      360,
      DEFAULT_LAYOUT.sidebarWidth,
    ),
    itemListWidth: clampNumber(
      layout?.itemListWidth,
      260,
      560,
      DEFAULT_LAYOUT.itemListWidth,
    ),
  };
}

export function normalizeLoggingSettings(
  logging: Partial<DesktopLoggingSettings> | null | undefined,
): DesktopLoggingSettings {
  return {
    level: isDesktopLogLevel(logging?.level)
      ? logging.level
      : DEFAULT_LOGGING_SETTINGS.level,
  };
}

export function normalizeSecuritySettings(
  security: Partial<DesktopSecuritySettings> | null | undefined,
): DesktopSecuritySettings {
  return {
    startOnLogin: Boolean(security?.startOnLogin),
    autoLockOnLimit:
      security?.autoLockOnLimit ?? DEFAULT_SECURITY_SETTINGS.autoLockOnLimit,
    autoLockDelaySeconds: clampNumber(
      security?.autoLockDelaySeconds,
      0,
      3_600,
      DEFAULT_SECURITY_SETTINGS.autoLockDelaySeconds,
    ),
  };
}

export function isDesktopLogLevel(level: unknown): level is DesktopLogLevel {
  return (
    level === "off" ||
    level === "error" ||
    level === "info" ||
    level === "debug"
  );
}

export function normalizeSyncSettings(
  sync: Partial<DesktopSyncSettings> | null | undefined,
): DesktopSyncSettings {
  const mode =
    sync?.mode === "official" || sync?.mode === "selfhost"
      ? sync.mode
      : DEFAULT_SYNC_SETTINGS.mode;
  const normalizedSelfHostUrl = normalizeSyncServerUrl(sync?.serverUrl ?? "");
  const selfHostServerUrl =
    normalizedSelfHostUrl === LEGACY_DEFAULT_SELF_HOST_SYNC_SERVER_URL &&
    !sync?.accountId &&
    !sync?.deviceId
      ? ""
      : normalizedSelfHostUrl;
  return {
    mode,
    serverUrl:
      mode === "official" ? configuredOfficialApiUrl() : selfHostServerUrl,
    syncSpaceId:
      typeof sync?.syncSpaceId === "string" && sync.syncSpaceId
        ? sync.syncSpaceId
        : null,
    accountId:
      typeof sync?.accountId === "string" && sync.accountId
        ? sync.accountId
        : null,
    accountLabel:
      typeof sync?.accountLabel === "string" && sync.accountLabel
        ? sync.accountLabel
        : null,
    deviceId:
      typeof sync?.deviceId === "string" && sync.deviceId
        ? sync.deviceId
        : null,
    cursor: clampNumber(
      sync?.cursor,
      0,
      Number.MAX_SAFE_INTEGER,
      DEFAULT_SYNC_SETTINGS.cursor,
    ),
    connectedAt:
      typeof sync?.connectedAt === "string" && sync.connectedAt
        ? sync.connectedAt
        : null,
    lastSyncAt:
      typeof sync?.lastSyncAt === "string" && sync.lastSyncAt
        ? sync.lastSyncAt
        : null,
  };
}

export function requireSelfHostServerUrl(value: string): string {
  const normalized = normalizeSyncServerUrl(value);
  if (!normalized) throw new Error("syncServerRequired");
  return normalized;
}

export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function createDefaultVault(
  deviceId: string,
  locale: SupportedLocale,
): Vault {
  const now = new Date().toISOString();

  return {
    id: `vault-${crypto.randomUUID()}`,
    schemaVersion: CORE_SCHEMA_VERSION,
    name: desktopMessages[locale].vault.defaultName,
    description: desktopMessages[locale].vault.defaultDescription,
    color: "slate",
    icon: "folder-lock",
    createdAt: now,
    updatedAt: now,
    sync: createSync(deviceId),
  };
}

export function createSync(deviceId: string): SyncMetadata {
  return {
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: deviceId,
    deletedAt: null,
    state: "dirty",
  };
}

export function buildImportedVault(
  name: string,
  now: string,
  deviceId: string,
  locale: SupportedLocale,
): Vault {
  return {
    id: `vault-${crypto.randomUUID()}`,
    schemaVersion: CORE_SCHEMA_VERSION,
    name: name.trim() || desktopMessages[locale].vault.importedName,
    description: "",
    color: "slate",
    icon: "folder-lock",
    createdAt: now,
    updatedAt: now,
    sync: createSync(deviceId),
  };
}

export function buildImportedItems(
  items: ExternalImportItem[],
  vaultId: string,
  now: string,
  deviceId: string,
  locale: SupportedLocale,
): VaultItem[] {
  return items.map((item) => {
    const itemId = `item-${crypto.randomUUID()}`;
    const fields = item.fields.map((field) => ({
      id: `field-${crypto.randomUUID()}`,
      kind: field.kind,
      label: field.label,
      value: field.value,
      sensitive: field.sensitive,
    }));

    return {
      id: itemId,
      vaultId,
      schemaVersion: CORE_SCHEMA_VERSION,
      type: item.type,
      title: item.title.trim() || desktopMessages[locale].itemDefaults.imported,
      subtitle: buildSubtitle(item.type, fields, [], item.notes, locale),
      notes: item.notes.trim(),
      urls: item.urls.filter(Boolean),
      tags: [],
      favorite: false,
      archived: false,
      fields: fields.filter((field) => field.kind !== "url"),
      attachmentIds: [],
      createdAt: now,
      updatedAt: now,
      sync: createSync(deviceId),
    };
  });
}

export function markDeletedObject<
  T extends { sync: SyncMetadata; updatedAt: string },
>(object: T, now: string, deviceId: string): T {
  return {
    ...object,
    updatedAt: now,
    sync: {
      revision: object.sync.revision + 1,
      baseRevision: object.sync.revision,
      updatedByDeviceId: deviceId,
      deletedAt: now,
      state: "dirty",
    },
  };
}

export function buildSubtitle(
  type: VaultItemType,
  fields: VaultItemField[],
  attachments: AttachmentDraft[],
  notes: string,
  locale: SupportedLocale,
): string {
  const defaults = desktopMessages[locale].itemDefaults;
  if (type === "attachment")
    return formatMessage(defaults.attachmentFiles, {
      count: String(attachments.length),
    });
  if (type === "payment-card")
    return (
      fields.find((field) => field.kind === "cardholder")?.value ||
      defaults.paymentCard
    );
  if (type === "secure-note")
    return notes.trim().slice(0, 80) || defaults.secureNote;

  const account =
    fields.find((field) => field.kind === "username")?.value ||
    defaults.account;
  const website =
    fields.find((field) => field.kind === "url")?.value || defaults.website;
  return formatMessage(defaults.loginSubtitle, { account, website });
}

export function formatMessage(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    supportedLocales.includes(value as SupportedLocale)
  );
}

function normalizeUsers(data: DesktopVaultStoreData | null): {
  users: DesktopUserProfile[];
  legacyPayloads: Record<string, DesktopVaultPayload>;
  hasLegacyPlaintext: boolean;
} {
  const legacyPayloads: Record<string, DesktopVaultPayload> = {};

  const isOldSchema = Boolean(
    data &&
      (data as { schemaVersion?: unknown }).schemaVersion !==
        DESKTOP_STORE_SCHEMA_VERSION,
  );

  if (Array.isArray(data?.users)) {
    const users = data.users.map((user) => {
      const normalizedUser = normalizeUserProfile(user);
      const legacyPayload = extractLegacyPayload(user);
      if (
        !normalizedUser.crypto &&
        (legacyPayload || hasLegacyPasswordAuth(user) || isOldSchema)
      ) {
        legacyPayloads[normalizedUser.id] = legacyPayload ?? emptyLegacyPayload();
      }
      return normalizedUser;
    });

    return {
      users,
      legacyPayloads,
      hasLegacyPlaintext: Object.keys(legacyPayloads).length > 0,
    };
  }

  const legacyPayload =
    extractLegacyPayload(data) ?? (isOldSchema ? emptyLegacyPayload() : null);

  if (!legacyPayload) {
    return {
      users: [],
      legacyPayloads,
      hasLegacyPlaintext: false,
    };
  }

  const now = new Date().toISOString();
  const userId = `user-${crypto.randomUUID()}`;
  legacyPayloads[userId] = legacyPayload;
  return {
    users: [
      {
        id: userId,
        username: "",
        displayName: "",
        createdAt: now,
        updatedAt: now,
        sync: { ...DEFAULT_SYNC_SETTINGS },
        crypto: null,
      },
    ],
    legacyPayloads,
    hasLegacyPlaintext: true,
  };
}

function extractLegacyPayload(value: unknown): DesktopVaultPayload | null {
  const record = value as {
    vaults?: unknown;
    items?: unknown;
    attachments?: unknown;
  } | null;
  const vaults = Array.isArray(record?.vaults)
    ? (record.vaults as Vault[])
    : [];
  const items = Array.isArray(record?.items)
    ? (record.items as VaultItem[])
    : [];
  const attachments = Array.isArray(record?.attachments)
    ? (record.attachments as VaultAttachment[])
    : [];

  if (!vaults.length && !items.length && !attachments.length) return null;
  return { vaults, items, attachments };
}

function hasLegacyPasswordAuth(value: unknown): boolean {
  return Boolean((value as { passwordAuth?: unknown } | null)?.passwordAuth);
}

function emptyLegacyPayload(): DesktopVaultPayload {
  return {
    vaults: [],
    items: [],
    attachments: [],
  };
}

function normalizeUserCrypto(
  cryptoConfig: DesktopUserProfile["crypto"],
): DesktopUserProfile["crypto"] {
  if (!cryptoConfig) return null;
  const { encryptedPayload: _encryptedPayload, ...normalized } =
    cryptoConfig as DesktopUserProfile["crypto"] & {
      encryptedPayload?: unknown;
    };
  return normalized;
}
