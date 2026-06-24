import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api/client'
import { userFacingErrorMessage } from '@/services/errorMessage'
import type { AccountView, AuthResponse, HealthResponse } from '@/types'

const tokenStorageKey = 'lockpass.admin_web.token'

export const useSessionStore = defineStore('session', () => {
  const token = ref<string | null>(localStorage.getItem(tokenStorageKey))
  const account = ref<AccountView | null>(null)
  const health = ref<HealthResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const isLoggedIn = computed(() => Boolean(token.value && account.value))
  const isAdmin = computed(() => account.value?.roles.includes('admin') ?? false)

  async function refreshHealth() {
    health.value = await api.health()
  }

  async function restore() {
    if (!token.value) return
    try {
      const me = await api.me(token.value)
      account.value = me.account
    } catch {
      clear()
    }
  }

  async function login(email: string, password: string): Promise<AuthResponse> {
    let result!: AuthResponse
    await withLoading(async () => {
      result = await api.login(email, password)
      setAuth(result.token, result.account)
    })
    return result
  }

  async function register(email: string, password: string, displayName: string): Promise<AuthResponse> {
    let result!: AuthResponse
    await withLoading(async () => {
      result = await api.register(email, password, displayName)
      setAuth(result.token, result.account)
    })
    return result
  }

  async function logout() {
    if (token.value) {
      try {
        await api.logout(token.value)
      } catch {
        // Local logout should still clear the session if the server is unavailable.
      }
    }
    clear()
  }

  function setAuth(nextToken: string, nextAccount: AccountView) {
    token.value = nextToken
    account.value = nextAccount
    localStorage.setItem(tokenStorageKey, nextToken)
  }

  function clear() {
    token.value = null
    account.value = null
    localStorage.removeItem(tokenStorageKey)
  }

  async function withLoading(task: () => Promise<void>) {
    loading.value = true
    error.value = null
    try {
      await task()
    } catch (cause) {
      error.value = userFacingErrorMessage(cause)
      throw cause
    } finally {
      loading.value = false
    }
  }

  return {
    token,
    account,
    health,
    loading,
    error,
    isLoggedIn,
    isAdmin,
    refreshHealth,
    restore,
    login,
    register,
    logout
  }
})
