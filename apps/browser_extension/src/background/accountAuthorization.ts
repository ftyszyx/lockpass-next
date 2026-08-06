import { loadPanelState, loadOrCreateClientDeviceId, saveDeviceAuthorization } from './repository'
import { parseExtensionAuthorizationCallback } from '@/services/extensionAuthorization'
import type { ExtensionPanelState } from '@/shared/models'

const OFFICIAL_WEB_URL = String(import.meta.env.VITE_LOCKPASS_OFFICIAL_SERVER_URL ?? '').trim()
const OFFICIAL_API_URL = String(import.meta.env.VITE_LOCKPASS_OFFICIAL_API_URL ?? '').trim()

export async function authorizeAccount(page: 'login' | 'register'): Promise<ExtensionPanelState> {
  if (!OFFICIAL_WEB_URL || !OFFICIAL_API_URL) throw new Error('official-web-url-missing')

  const redirectUrl = chrome.identity.getRedirectURL('auth/callback')
  const loginUrl = new URL('/login', OFFICIAL_WEB_URL)
  loginUrl.searchParams.set('extensionBind', '1')
  loginUrl.searchParams.set('mode', 'official')
  loginUrl.searchParams.set('serverUrl', OFFICIAL_API_URL)
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
  await saveDeviceAuthorization(authorization)
  await chrome.action.openPopup().catch(() => undefined)
  return loadPanelState()
}
