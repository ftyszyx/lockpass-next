import type { ExtensionItemSaveInput, ExtensionPanelState } from '@/shared/models'
import { request, type ExtensionResponse } from '@/shared/messages'

const SITE_ORIGINS = ['http://*/*', 'https://*/*']

export class ExtensionRuntimeUnavailableError extends Error {
  constructor() {
    super('extension-runtime-unavailable')
    this.name = 'ExtensionRuntimeUnavailableError'
  }
}

export async function loadExtensionPanelState(): Promise<ExtensionPanelState> {
  assertExtensionRuntime()
  const response = await send(request('panel.state.get', {}))
  if (!response.ok || !('state' in response)) throw new Error(response.ok ? 'missing state' : response.error)
  return response.state
}

export async function setPanelSelection(input: {
  vaultId?: 'all' | string
  itemId?: string | null
}): Promise<void> {
  assertExtensionRuntime()
  const response = await send(request('panel.selection.set', input))
  if (!response.ok) throw new Error(response.error)
}

export async function savePanelItem(item: ExtensionItemSaveInput): Promise<ExtensionPanelState> {
  assertExtensionRuntime()
  const response = await send(request('panel.item.save', { item }))
  if (!response.ok || !('state' in response)) throw new Error(response.ok ? 'missing state' : response.error)
  return response.state
}

export async function unlockPanel(input: {
  serverUrl: string
  password: string
  secretKey?: string
}): Promise<ExtensionPanelState> {
  assertExtensionRuntime()
  const serverAccessGranted = await chrome.permissions.request({
    origins: [serverPermissionPattern(input.serverUrl)]
  })
  if (!serverAccessGranted) throw new Error('server-access-denied')

  const response = await send(request('panel.unlock', {
    password: input.password,
    secretKey: input.secretKey
  }))
  if (!response.ok || !('state' in response)) throw new Error(response.ok ? 'missing state' : response.error)
  return response.state
}

export async function lockPanel(): Promise<ExtensionPanelState> {
  assertExtensionRuntime()
  const response = await send(request('panel.lock', {}))
  if (!response.ok || !('state' in response)) throw new Error(response.ok ? 'missing state' : response.error)
  return response.state
}

export async function openAccountWebPage(page: 'login' | 'register'): Promise<ExtensionPanelState> {
  assertExtensionRuntime()
  const response = await send(request('panel.web.open', { page }))
  if (!response.ok || !('state' in response)) throw new Error(response.ok ? 'missing state' : response.error)
  return response.state
}

export async function requestSiteAccess(): Promise<boolean> {
  assertExtensionRuntime()
  const enabled = await chrome.permissions.request({ origins: SITE_ORIGINS })
  const response = await send(request('panel.siteAccess.changed', { enabled }))
  if (!response.ok) throw new Error(response.error)
  return enabled
}

export function onExtensionStateChanged(handler: () => void): () => void {
  if (!isExtensionRuntime()) return () => undefined
  const storageListener = () => handler()
  const focusListener = () => handler()
  const visibilityListener = () => {
    if (document.visibilityState === 'visible') handler()
  }

  chrome.storage.onChanged.addListener(storageListener)
  window.addEventListener('focus', focusListener)
  document.addEventListener('visibilitychange', visibilityListener)

  return () => {
    chrome.storage.onChanged.removeListener(storageListener)
    window.removeEventListener('focus', focusListener)
    document.removeEventListener('visibilitychange', visibilityListener)
  }
}

function isExtensionRuntime(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id)
}

function assertExtensionRuntime(): void {
  if (!isExtensionRuntime()) throw new ExtensionRuntimeUnavailableError()
}

async function send(message: ReturnType<typeof request>): Promise<ExtensionResponse> {
  return chrome.runtime.sendMessage(message) as Promise<ExtensionResponse>
}

function serverPermissionPattern(serverUrl: string): string {
  const url = new URL(serverUrl)
  return `${url.protocol}//${url.hostname}/*`
}
