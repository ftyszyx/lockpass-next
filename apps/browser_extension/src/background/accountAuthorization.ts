import { loadPanelState, loadOrCreateClientDeviceId, saveDeviceAuthorization } from './repository'
import { parseExtensionAuthorizationCallback } from '@/services/extensionAuthorization'
import {
  assertExtensionAuthorizationTarget,
  normalizeSelfHostServerUrl
} from '@/services/extensionServer'
import type { ExtensionPanelState } from '@/shared/models'

const OFFICIAL_WEB_URL = String(import.meta.env.VITE_LOCKPASS_OFFICIAL_SERVER_URL ?? '').trim()
const OFFICIAL_API_URL = String(import.meta.env.VITE_LOCKPASS_OFFICIAL_API_URL ?? '').trim()

export async function authorizeAccount(page: 'login' | 'register'): Promise<ExtensionPanelState> {
  const state = await loadPanelState()
  const target = authorizationTarget(state)

  const redirectUrl = chrome.identity.getRedirectURL('auth/callback')
  const loginUrl = new URL('/login', target.webUrl)
  loginUrl.searchParams.set('extensionBind', '1')
  loginUrl.searchParams.set('mode', target.mode)
  loginUrl.searchParams.set('serverUrl', target.apiUrl)
  loginUrl.searchParams.set('deviceName', 'LockPass Browser Extension')
  loginUrl.searchParams.set('clientDeviceId', await loadOrCreateClientDeviceId())
  loginUrl.searchParams.set('redirectUri', redirectUrl)
  if (page === 'register') loginUrl.searchParams.set('authMode', 'register')

  let callbackUrl: string | undefined
  try {
    callbackUrl = await chrome.identity.launchWebAuthFlow({ url: loginUrl.toString(), interactive: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/cancel|closed|not approve|user did not/i.test(message)) throw new Error('authorization-cancelled')
    throw error
  }
  if (!callbackUrl) throw new Error('authorization-cancelled')

  const authorization = parseExtensionAuthorizationCallback(callbackUrl, redirectUrl)
  assertExtensionAuthorizationTarget(authorization, target)
  await saveDeviceAuthorization(authorization)
  await chrome.action.openPopup().catch(() => undefined)
  return loadPanelState()
}

function authorizationTarget(state: ExtensionPanelState) {
  if (state.serverSettings.mode === 'selfhost') {
    const serverUrl = normalizeSelfHostServerUrl(state.serverSettings.selfHostUrl)
    return { mode: 'selfhost' as const, webUrl: serverUrl, apiUrl: serverUrl }
  }
  if (!OFFICIAL_WEB_URL || !OFFICIAL_API_URL) throw new Error('official-web-url-missing')
  return {
    mode: 'official' as const,
    webUrl: normalizeConfiguredUrl(OFFICIAL_WEB_URL),
    apiUrl: normalizeConfiguredUrl(OFFICIAL_API_URL)
  }
}

function normalizeConfiguredUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('official-web-url-missing')
  return url.toString().replace(/\/+$/, '')
}
