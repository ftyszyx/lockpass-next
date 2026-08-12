import type { EncryptedSyncObjectPayload, KdfParams, WrappedVaultKey } from '@/services/masterPassword'
import { normalizeServerUrl } from '@/services/appConfig'

export type SyncMode = 'official' | 'selfhost'

export interface SyncDeviceBindResponse {
  account: {
    id: string
    displayName: string
    email?: string | null
  }
  device: {
    id: string
    clientDeviceId?: string | null
    name: string
    tokenScopes?: string[]
  }
  deviceToken: string
  tokenType: string
}

export interface SyncDeviceBindCallbackPayload extends SyncDeviceBindResponse {
  mode: SyncMode
  serverUrl: string
}

export interface SyncSpaceView {
  id: string
  displayName: string
  encryptedMetadata?: unknown
}

export interface SyncSpacesResponse {
  syncSpaces: SyncSpaceView[]
}

export interface SyncObjectView {
  syncSpaceId: string
  objectId: string
  vaultId: string
  objectType: 'vault_item' | 'vault_attachment' | 'vault_metadata'
  revision: number
  encryptedPayload: EncryptedSyncObjectPayload
  updatedByDeviceId?: string
  deletedAt?: string | null
  updatedAt?: string
}

export interface SyncPushObject {
  clientOperationId: string
  syncSpaceId: string
  objectId: string
  vaultId: string
  objectType: 'vault_item' | 'vault_attachment' | 'vault_metadata'
  baseRevision: number
  revision: number
  encryptedPayload: EncryptedSyncObjectPayload
  deletedAt: string | null
}

export interface SyncPushAccepted {
  clientOperationId: string
  objectId: string
  revision: number
  eventId?: number
}

export interface SyncConflict {
  clientOperationId: string
  objectId: string
  expectedRevision: number
  currentRevision: number
  serverObject?: SyncObjectView | null
}

export interface SyncRejected {
  clientOperationId?: string
  objectId?: string
  code: string
  message: string
}

export interface SyncPushResponse {
  accepted: SyncPushAccepted[]
  conflicts: SyncConflict[]
  rejected: SyncRejected[]
  nextCursor: number
}

export interface SyncEventView {
  id: number
  syncSpaceId: string
  eventType: 'created' | 'updated' | 'deleted'
  objectId: string
  objectRevision: number
  baseRevision: number
  objectSnapshot: SyncObjectView
  createdAt?: string
}

export interface SyncPullResponse {
  cursor: number
  nextCursor: number
  hasMore?: boolean
  events: SyncEventView[]
}

export interface SyncSnapshotResponse {
  syncSpaceId: string
  snapshotCursor: number
  generatedAt?: string
  wrappedVaultKeys?: unknown[]
  objects: SyncObjectView[]
  includesTombstones?: boolean
  nextPageToken?: string | null
}

export interface WrappedVaultKeyCreateRequest {
  syncSpaceId: string
  vaultId: string
  keyId: string
  wrapType: 'user_wrapped'
  replacesWrappedVaultKeyId?: string | null
  kdfParams: KdfParams
  wrappedVaultKey: WrappedVaultKey
}

export interface WrappedVaultKeyView {
  id: string
  syncSpaceId: string
  vaultId: string
  keyId: string
  wrapType: 'user_wrapped'
  generation: number
  kdfParams: KdfParams
  wrappedVaultKey: WrappedVaultKey
  createdAt: string
}

export interface WrappedVaultKeysResponse {
  wrappedVaultKeys: WrappedVaultKeyView[]
}

export interface WrappedVaultKeyCreateResponse {
  wrappedVaultKeyRecord: Pick<
    WrappedVaultKeyView,
    'id' | 'syncSpaceId' | 'vaultId' | 'keyId' | 'wrapType' | 'generation' | 'createdAt'
  >
}

export class SyncApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export class SyncNetworkError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
  }
}

export class SyncApiClient {
  constructor(private readonly baseUrl: string) {}

  async bindDevice(sessionToken: string, deviceName: string, clientDeviceId?: string): Promise<SyncDeviceBindResponse> {
    return this.request('/auth/device/bind', {
      token: sessionToken,
      body: { deviceName, clientDeviceId }
    })
  }

  async syncSpaces(token: string): Promise<SyncSpacesResponse> {
    return this.request('/sync/spaces', { token })
  }

  async createSyncSpace(token: string, displayName: string): Promise<{ syncSpace: SyncSpaceView }> {
    return this.request('/sync/spaces', {
      token,
      body: {
        displayName,
        encryptedMetadata: {
          version: 1,
          alg: 'client-managed',
          ciphertext: 'encrypted-sync-space-metadata-placeholder'
        }
      }
    })
  }

  async createWrappedVaultKey(
    token: string,
    body: WrappedVaultKeyCreateRequest
  ): Promise<WrappedVaultKeyCreateResponse> {
    return this.request('/sync/wrapped-vault-keys', {
      token,
      body
    })
  }

  async wrappedVaultKeys(token: string, syncSpaceId: string): Promise<WrappedVaultKeysResponse> {
    return this.request('/sync/wrapped-vault-keys', {
      token,
      query: { syncSpaceId }
    })
  }

  async pushSync(token: string, objects: SyncPushObject[]): Promise<SyncPushResponse> {
    return this.request('/sync/push', {
      token,
      body: {
        clientBatchId: crypto.randomUUID(),
        objects
      }
    })
  }

  async pullSync(token: string, cursor: number, limit = 200): Promise<SyncPullResponse> {
    return this.request('/sync/pull', { token, query: { cursor, limit } })
  }

  async snapshot(
    token: string,
    syncSpaceId: string,
    options: { pageToken?: string | null; limit?: number } = {}
  ): Promise<SyncSnapshotResponse> {
    return this.request('/sync/snapshot', {
      token,
      query: {
        syncSpaceId,
        pageToken: options.pageToken ?? undefined,
        limit: options.limit
      }
    })
  }

  async ackSync(token: string, cursor: number): Promise<{ ok: boolean }> {
    return this.request('/sync/ack', { token, body: { cursor } })
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST'
      token?: string | null
      body?: unknown
      query?: Record<string, string | number | boolean | undefined | null>
    } = {}
  ): Promise<T> {
    const baseUrl = this.baseUrl.replace(/\/+$/, '')
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const url = new URL(`${baseUrl}${normalizedPath}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: options.body === undefined ? options.method ?? 'GET' : options.method ?? 'POST',
        headers: {
          Accept: 'application/json',
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      })
    } catch (error) {
      throw new SyncNetworkError('syncNetworkBlocked', error)
    }

    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    if (!response.ok) {
      throw new SyncApiError(data?.message || response.statusText, response.status)
    }
    return data as T
  }
}

export function normalizeSyncServerUrl(value: string): string {
  return normalizeServerUrl(value)
}
