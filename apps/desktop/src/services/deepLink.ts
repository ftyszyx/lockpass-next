import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type DeepLinkHandler = (url: string) => void | Promise<void>

const NATIVE_DEEP_LINK_EVENT = 'lockpass-deep-link'
const DEEP_LINK_PREFIX = 'lockpass://'
const handlers = new Set<DeepLinkHandler>()
const pendingUrls: string[] = []

export function subscribeToDeepLinks(handler: DeepLinkHandler): () => void {
  handlers.add(handler)
  const urls = pendingUrls.splice(0)
  for (const url of urls) {
    void handler(url)
  }

  return () => {
    handlers.delete(handler)
  }
}

export async function startDeepLinkListener(): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined

  const unlisteners: UnlistenFn[] = []
  let drainTimer: number | null = null
  const seen = new Set<string>()
  const dispatch = (payload: unknown) => {
    for (const url of normalizeDeepLinkPayload(payload)) {
      if (seen.has(url)) continue
      seen.add(url)
      dispatchToSubscribers(url)
    }
  }
  const drainNativePending = async () => {
    dispatch(await invoke<string[]>('take_pending_deep_links').catch(() => []))
  }

  try {
    unlisteners.push(await listen(NATIVE_DEEP_LINK_EVENT, (event) => dispatch(event.payload)))
  } catch {
    // Native queue polling below still handles desktop callbacks.
  }

  await drainNativePending()
  drainTimer = window.setInterval(() => {
    void drainNativePending()
  }, 750)

  try {
    const deepLink = await import('@tauri-apps/plugin-deep-link')
    unlisteners.push(await deepLink.onOpenUrl((urls) => dispatch(urls)))
    dispatch(await deepLink.getCurrent().catch(() => null))
  } catch {
    // The native fallback below still handles desktop callbacks.
  }

  return () => {
    if (drainTimer !== null) window.clearInterval(drainTimer)
    for (const unlisten of unlisteners) unlisten()
  }
}

function dispatchToSubscribers(url: string): void {
  if (handlers.size === 0) {
    if (!pendingUrls.includes(url)) pendingUrls.push(url)
    return
  }

  for (const handler of handlers) {
    void handler(url)
  }
}

function normalizeDeepLinkPayload(payload: unknown): string[] {
  const values = Array.isArray(payload) ? payload : typeof payload === 'string' ? [payload] : []
  return values.filter((value): value is string => typeof value === 'string' && value.startsWith(DEEP_LINK_PREFIX))
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
