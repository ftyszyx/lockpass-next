import type { EncryptedSyncObjectPayload, KdfParams, WrappedVaultKey } from '@lockpass/crypto'

export interface ExtensionSyncSpace {
  id: string
  displayName: string
}

export interface ExtensionSyncObject {
  objectId: string
  vaultId: string
  objectType: 'vault_item' | 'vault_attachment' | 'vault_metadata'
  revision: number
  encryptedPayload: EncryptedSyncObjectPayload
  updatedByDeviceId?: string
  deletedAt?: string | null
}

export interface ExtensionWrappedVaultKey {
  vaultId: string
  keyId: string
  kdfParams: KdfParams
  wrappedVaultKey: WrappedVaultKey
}

export interface ExtensionSyncSnapshot {
  snapshotCursor: number
  wrappedVaultKeys?: ExtensionWrappedVaultKey[]
  objects: ExtensionSyncObject[]
  nextPageToken?: string | null
}

export interface ExtensionSyncPushObject {
  clientOperationId: string
  syncSpaceId: string
  objectId: string
  vaultId: string
  objectType: ExtensionSyncObject['objectType']
  baseRevision: number
  revision: number
  encryptedPayload: EncryptedSyncObjectPayload
  deletedAt: string | null
}

export interface ExtensionSyncPushResponse {
  accepted: Array<{
    clientOperationId: string
    objectId: string
    revision: number
    eventId?: number
  }>
  conflicts: Array<{
    clientOperationId: string
    objectId: string
    expectedRevision: number
    currentRevision: number
  }>
  rejected: Array<{
    clientOperationId?: string
    objectId?: string
    code: string
    message: string
  }>
  nextCursor: number
}

export class ExtensionSyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly network = false
  ) {
    super(message)
    this.name = 'ExtensionSyncError'
  }
}

export class ExtensionSyncClient {
  constructor(private readonly baseUrl: string) {}

  async syncSpaces(token: string): Promise<{ syncSpaces: ExtensionSyncSpace[] }> {
    return this.request('/sync/spaces', token)
  }

  async snapshot(
    token: string,
    syncSpaceId: string,
    pageToken?: string | null
  ): Promise<ExtensionSyncSnapshot> {
    return this.request('/sync/snapshot', token, {
      query: {
        syncSpaceId,
        pageToken: pageToken || undefined,
        limit: 200
      }
    })
  }

  async push(token: string, objects: ExtensionSyncPushObject[]): Promise<ExtensionSyncPushResponse> {
    return this.request('/sync/push', token, {
      body: {
        clientBatchId: crypto.randomUUID(),
        objects
      }
    })
  }

  async ack(token: string, cursor: number): Promise<void> {
    await this.request('/sync/ack', token, { body: { cursor } })
  }

  private async request<T>(
    path: string,
    token: string,
    options: {
      query?: Record<string, string | number | undefined>
      body?: unknown
    } = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl.replace(/\/+$/, '')}${path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: options.body === undefined ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      })
    } catch {
      throw new ExtensionSyncError('server-unavailable', undefined, true)
    }

    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      throw new ExtensionSyncError('server-response-invalid', response.status)
    }
    if (!response.ok) {
      const message = typeof body === 'object' && body && 'message' in body
        ? String(body.message)
        : response.statusText
      throw new ExtensionSyncError(message || 'server-request-failed', response.status)
    }
    return body as T
  }
}
