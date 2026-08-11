import type { SyncDeviceBindResponse } from '@/services/syncClient'
import { configuredOfficialApiUrl } from '@/services/appConfig'

export interface WebAccountView {
  id: string
  displayName: string
  email?: string | null
  roles: string[]
}

export interface WebAuthResponse {
  account: WebAccountView
  token: string
  tokenType: string
}

export type EmailChallengePurpose = 'register' | 'login'

export interface WebEmailStartResponse {
  challengeId: string
  email: string
  expiresAt: string
  resendAfterSeconds: number
}

export interface WebEmailVerifyResponse {
  accountSetupToken: string
  email: string
  displayName?: string | null
  purpose: EmailChallengePurpose
  expiresAt: string
}

export interface WebMeResponse {
  account: WebAccountView
  roles: string[]
}

export class WebApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errorCode = ''
  ) {
    super(message)
  }
}

export class WebApiClient {
  constructor(private readonly baseUrl = configuredOfficialApiUrl()) {}

  async startEmail(email: string, purpose: EmailChallengePurpose, displayName?: string, locale?: string): Promise<WebEmailStartResponse> {
    return this.request('/auth/email/start', {
      body: { email, purpose, displayName, locale }
    })
  }

  async verifyEmail(challengeId: string, code: string): Promise<WebEmailVerifyResponse> {
    return this.request('/auth/email/verify', {
      body: { challengeId, code }
    })
  }

  async completeEmailLogin(setupToken: string): Promise<WebAuthResponse> {
    return this.request('/auth/email/complete-login', {
      method: 'POST',
      token: setupToken
    })
  }

  async completeAccount(setupToken: string, deviceName: string, clientDeviceId?: string): Promise<SyncDeviceBindResponse> {
    return this.request('/auth/account/complete', {
      token: setupToken,
      body: { deviceName, clientDeviceId }
    })
  }

  async me(token: string): Promise<WebMeResponse> {
    return this.request('/auth/me', { token })
  }

  async logout(token: string): Promise<{ ok: boolean }> {
    return this.request('/auth/logout', { method: 'POST', token })
  }

  async bindDevice(token: string, deviceName: string, clientDeviceId?: string): Promise<SyncDeviceBindResponse> {
    return this.request('/auth/device/bind', {
      token,
      body: { deviceName, clientDeviceId }
    })
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
      throw new WebApiError(data?.message || response.statusText, response.status, data?.error || '')
    }
    return data as T
  }
}

export const webApi = new WebApiClient()
