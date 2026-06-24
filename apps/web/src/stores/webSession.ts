import { defineStore } from 'pinia'
import { webApi, type WebAccountView, type WebAuthResponse } from '../api/client'
import type { SyncDeviceBindCallbackPayload, SyncMode } from '@/services/syncClient'

const TOKEN_STORAGE_KEY = 'lockpass.web.session.token'
const DEVICE_TOKEN_STORAGE_KEY = 'lockpass.web.device.token'
const DEVICE_BINDING_STORAGE_KEY = 'lockpass.web.device.binding'

export const useWebSessionStore = defineStore('web-session', {
  state: () => ({
    restored: false,
    token: typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_STORAGE_KEY),
    account: null as WebAccountView | null,
    deviceBinding: loadDeviceBinding(),
    loading: false,
    error: ''
  }),
  getters: {
    signedIn: (state) => Boolean(state.token && state.account),
    accountLabel: (state) => state.account?.email || state.account?.displayName || ''
  },
  actions: {
    async restore(): Promise<void> {
      if (this.restored) return
      this.restored = true
      if (!this.token) return
      try {
        const result = await webApi.me(this.token)
        this.account = result.account
      } catch {
        this.clear()
      }
    },
    async login(email: string, password: string): Promise<WebAuthResponse> {
      return this.withLoading(async () => {
        const result = await webApi.login(email, password)
        this.setAuth(result)
        return result
      })
    },
    async register(email: string, password: string, displayName: string): Promise<WebAuthResponse> {
      return this.withLoading(async () => {
        const result = await webApi.register(email, password, displayName)
        this.setAuth(result)
        return result
      })
    },
    async bindWebDevice(input: { mode: SyncMode; serverUrl: string; deviceName: string; clientDeviceId?: string }): Promise<SyncDeviceBindCallbackPayload> {
      if (!this.token) throw new Error('syncNotConnected')
      const exchange = await webApi.bindDevice(this.token, input.deviceName, input.clientDeviceId)
      const binding: SyncDeviceBindCallbackPayload = {
        mode: input.mode,
        serverUrl: input.serverUrl,
        account: exchange.account,
        device: exchange.device,
        deviceToken: exchange.deviceToken,
        tokenType: exchange.tokenType
      }
      this.deviceBinding = binding
      localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, exchange.deviceToken)
      localStorage.setItem(DEVICE_BINDING_STORAGE_KEY, JSON.stringify(binding))
      return binding
    },
    async logout(): Promise<void> {
      if (this.token) {
        await webApi.logout(this.token).catch(() => undefined)
      }
      this.clear()
    },
    setAuth(result: WebAuthResponse): void {
      this.token = result.token
      this.account = result.account
      localStorage.setItem(TOKEN_STORAGE_KEY, result.token)
    },
    clear(): void {
      this.token = null
      this.account = null
      localStorage.removeItem(TOKEN_STORAGE_KEY)
    },
    async withLoading<T>(task: () => Promise<T>): Promise<T> {
      this.loading = true
      this.error = ''
      try {
        return await task()
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error)
        throw error
      } finally {
        this.loading = false
      }
    }
  }
})

function loadDeviceBinding(): SyncDeviceBindCallbackPayload | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(DEVICE_BINDING_STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SyncDeviceBindCallbackPayload
  } catch {
    localStorage.removeItem(DEVICE_BINDING_STORAGE_KEY)
    return null
  }
}
