import type {
  AccountView,
  AdminRolesResponse,
  AdminSyncDataResponse,
  AuditLogView,
  AuthResponse,
  DeviceView,
  EmailServicePatch,
  EmailTemplateDetail,
  EmailTemplateListResponse,
  EmailTemplatePreviewResponse,
  HealthResponse,
  IdentityView,
  InstanceConfig,
  InstanceConfigPatch,
  MeResponse,
  ServerLogListResponse,
  ServerLogQuery,
  SyncAckResponse,
  SyncPullResponse,
  SyncPushObject,
  SyncPushResponse,
  SyncSnapshotResponse,
  SyncSpaceCreateRequest,
  SyncSpaceView,
  SyncSpacesResponse,
  UsageResponse,
  WrappedVaultKeyCreateRequest,
  WrappedVaultKeyCreateResponse,
  WrappedVaultKeysResponse
} from '@/types'

const defaultBaseUrl = import.meta.env.VITE_LOCKPASS_API_BASE_URL || 'http://127.0.0.1:1480'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode?: string
  ) {
    super(message)
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  token?: string | null
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
}

export class ApiClient {
  constructor(private readonly baseUrl: string = defaultBaseUrl) {}

  get url() {
    return this.baseUrl
  }

  async health() {
    return this.request<HealthResponse>('/health')
  }

  async adminLogin(username: string, password: string) {
    return this.request<AuthResponse>('/auth/admin/login', {
      body: { username, password }
    })
  }

  async changeAdminPassword(token: string, currentPassword: string, newPassword: string) {
    return this.request<AuthResponse>('/admin/password', {
      token,
      body: { currentPassword, newPassword }
    })
  }

  async me(token: string) {
    return this.request<MeResponse>('/auth/me', { token })
  }

  async logout(token: string) {
    return this.request<{ ok: boolean }>('/auth/logout', { method: 'POST', token })
  }

  async profile(token: string) {
    return this.request<AccountView>('/console/profile', { token })
  }

  async updateProfile(token: string, displayName: string) {
    return this.request<AccountView>('/console/profile', {
      token,
      body: { displayName }
    })
  }

  async identities(token: string) {
    return this.request<IdentityView[]>('/console/identities', { token })
  }

  async devices(token: string) {
    return this.request<DeviceView[]>('/console/devices', { token })
  }

  async revokeDevice(token: string, id: string) {
    return this.request<{ ok: boolean }>(`/console/devices/${id}`, { token, method: 'DELETE' })
  }

  async updateDeviceRemark(token: string, id: string, remark: string) {
    return this.request<DeviceView>(`/devices/${id}`, { token, method: 'PATCH', body: { remark } })
  }

  async syncSpaces(token: string) {
    return this.request<SyncSpacesResponse>('/sync/spaces', { token })
  }

  async createSyncSpace(token: string, body: SyncSpaceCreateRequest = {}) {
    return this.request<{ syncSpace: SyncSpaceView }>('/sync/spaces', { token, body })
  }

  async wrappedVaultKeys(token: string, syncSpaceId: string) {
    return this.request<WrappedVaultKeysResponse>('/sync/wrapped-vault-keys', {
      token,
      query: { syncSpaceId }
    })
  }

  async createWrappedVaultKey(token: string, body: WrappedVaultKeyCreateRequest) {
    return this.request<WrappedVaultKeyCreateResponse>('/sync/wrapped-vault-keys', { token, body })
  }

  async syncSnapshot(token: string, syncSpaceId: string, pageToken?: string | null) {
    return this.request<SyncSnapshotResponse>('/sync/snapshot', {
      token,
      query: { syncSpaceId, pageToken }
    })
  }

  async pushSync(token: string, objects: SyncPushObject[], clientBatchId?: string) {
    return this.request<SyncPushResponse>('/sync/push', {
      token,
      body: { clientBatchId, objects }
    })
  }

  async pullSync(token: string, cursor = 0, limit?: number) {
    return this.request<SyncPullResponse>('/sync/pull', {
      token,
      query: { cursor, limit }
    })
  }

  async ackSync(token: string, cursor: number) {
    return this.request<SyncAckResponse>('/sync/ack', {
      token,
      body: { cursor }
    })
  }

  async usage(token: string) {
    return this.request<UsageResponse>('/console/usage', { token })
  }

  async syncData(token: string) {
    return this.request<AdminSyncDataResponse>('/console/sync-data', { token })
  }

  async adminAccounts(token: string) {
    return this.request<AccountView[]>('/admin/accounts', { token })
  }

  async patchAdminAccount(token: string, id: string, body: { displayName?: string; disabled?: boolean }) {
    return this.request<AccountView>(`/admin/accounts/${id}`, { token, method: 'PATCH', body })
  }

  async grantAdminRole(token: string, accountId: string, role: string) {
    return this.request<AccountView>(`/admin/accounts/${accountId}/roles`, { token, body: { role } })
  }

  async revokeAdminRole(token: string, accountId: string, role: string) {
    return this.request<AccountView>(`/admin/accounts/${accountId}/roles/${role}`, { token, method: 'DELETE' })
  }

  async adminDevices(token: string) {
    return this.request<DeviceView[]>('/admin/devices', { token })
  }

  async adminConfig(token: string) {
    return this.request<InstanceConfig>('/admin/config', { token })
  }

  async patchAdminConfig(token: string, body: InstanceConfigPatch) {
    return this.request<InstanceConfig>('/admin/config', { token, method: 'PATCH', body })
  }

  async testAdminEmailConnection(token: string, email: EmailServicePatch) {
    return this.request<{ ok: boolean }>('/admin/email/test-connection', {
      token,
      body: { email }
    })
  }

  async sendAdminTestEmail(token: string, recipient: string, templateId: string, email: EmailServicePatch) {
    return this.request<{ ok: boolean }>('/admin/email/send-test', {
      token,
      body: { recipient, templateId, email }
    })
  }

  async adminEmailTemplates(token: string) {
    return this.request<EmailTemplateListResponse>('/admin/email/templates', { token })
  }

  async adminEmailTemplate(token: string, templateId: string) {
    return this.request<EmailTemplateDetail>(`/admin/email/templates/${encodeURIComponent(templateId)}`, { token })
  }

  async updateAdminEmailTemplate(token: string, templateId: string, subject: string, html: string) {
    return this.request<EmailTemplateDetail>(`/admin/email/templates/${encodeURIComponent(templateId)}`, {
      token,
      method: 'PUT',
      body: { subject, html }
    })
  }

  async restoreAdminEmailTemplate(token: string, templateId: string) {
    return this.request<EmailTemplateDetail>(`/admin/email/templates/${encodeURIComponent(templateId)}/restore`, {
      token,
      method: 'POST'
    })
  }

  async previewAdminEmailTemplate(token: string, templateId: string, subject: string, html: string) {
    return this.request<EmailTemplatePreviewResponse>('/admin/email/templates/preview', {
      token,
      body: { templateId, subject, html }
    })
  }

  async adminRoles(token: string) {
    return this.request<AdminRolesResponse>('/admin/roles', { token })
  }

  async adminSyncData(token: string) {
    return this.request<AdminSyncDataResponse>('/admin/sync-data', { token })
  }

  async auditLogs(token: string) {
    return this.request<AuditLogView[]>('/admin/audit-logs', { token })
  }

  async serverLogs(token: string, query: ServerLogQuery = {}) {
    return this.request<ServerLogListResponse>('/admin/server-logs', {
      token,
      query: {
        level: query.level,
        accountId: query.accountId,
        search: query.search,
        page: query.page,
        pageSize: query.pageSize
      }
    })
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.baseUrl)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value))
      }
    }

    const response = await fetch(url, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: {
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    })

    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    if (!response.ok) {
      throw new ApiError(data?.message || response.statusText, response.status, data?.error)
    }
    return data as T
  }
}

export const api = new ApiClient()
