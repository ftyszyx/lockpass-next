export const CORE_SCHEMA_VERSION = 1 as const;

export type CoreSchemaVersion = typeof CORE_SCHEMA_VERSION;
export type IsoDateString = string;
export type LockPassId = string;

export type VaultColor =
  | "blue"
  | "green"
  | "orange"
  | "purple"
  | "rose"
  | "slate";

export type SyncState = "clean" | "dirty" | "pending" | "conflicted";

export interface SyncMetadata {
  revision: number;
  baseRevision: number;
  updatedByDeviceId: LockPassId;
  deletedAt: IsoDateString | null;
  state: SyncState;
}

export interface Vault {
  id: LockPassId;
  schemaVersion: CoreSchemaVersion;
  name: string;
  description: string;
  color: VaultColor;
  icon: string;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  sync: SyncMetadata;
}

export type VaultItemType =
  | "login"
  | "secure-note"
  | "payment-card"
  | "attachment"
  | "identity"
  | "recovery-code";

export type VaultItemFieldKind =
  | "username"
  | "password"
  | "url"
  | "totp"
  | "email"
  | "phone"
  | "text"
  | "group"
  | "date"
  | "secret"
  | "note"
  | "attachment"
  | "cardholder"
  | "card-number"
  | "expiry"
  | "cvv"
  | "recovery-code";

export interface VaultItemField {
  id: LockPassId;
  kind: VaultItemFieldKind;
  label: string;
  value: string;
  sensitive: boolean;
  children?: VaultItemField[];
  collapsed?: boolean;
}

export interface VaultItem {
  id: LockPassId;
  vaultId: LockPassId;
  schemaVersion: CoreSchemaVersion;
  type: VaultItemType;
  title: string;
  subtitle: string;
  notes: string;
  urls: string[];
  tags: string[];
  favorite: boolean;
  archived: boolean;
  fields: VaultItemField[];
  attachmentIds: LockPassId[];
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  sync: SyncMetadata;
}

export type AttachmentState = "available" | "pending-upload" | "missing";

export interface VaultAttachment {
  id: LockPassId;
  vaultId: LockPassId;
  itemId: LockPassId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  encryptedBlobRef: string;
  state: AttachmentState;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  sync: SyncMetadata;
}

export type VaultLockStatus = "locked" | "unlocked";

export interface VaultLockState {
  status: VaultLockStatus;
  activeVaultId: LockPassId | null;
  unlockedAt: IsoDateString | null;
  autoLockAt: IsoDateString | null;
}

export interface VaultListFilterState {
  query: string;
  selectedType: VaultItemType | "all";
  selectedTag: string | null;
  favoritesOnly: boolean;
  includeArchived: boolean;
}

export interface DesktopVaultSeedState {
  vaults: Vault[];
  items: VaultItem[];
  attachments: VaultAttachment[];
  selectedVaultId: LockPassId;
  selectedItemId: LockPassId | null;
  filters: VaultListFilterState;
  lockState: VaultLockState;
}

export interface EncryptedPayloadEnvelope {
  version: CoreSchemaVersion;
  alg: "AES-256-GCM" | "XChaCha20-Poly1305";
  keyId: LockPassId;
  nonce: string;
  aad: {
    objectType: "vault_item" | "vault_attachment" | "vault_metadata";
    objectId: LockPassId;
    schemaVersion: CoreSchemaVersion;
  };
  ciphertext: string;
  tag: string;
}

export interface SyncObject {
  id: LockPassId;
  vaultId: LockPassId;
  revision: number;
  baseRevision: number;
  updatedAt: IsoDateString;
  updatedByDeviceId: LockPassId;
  deletedAt: IsoDateString | null;
  encryptedPayload: EncryptedPayloadEnvelope;
}
