import { invoke } from '@tauri-apps/api/core'
import { emitTo, listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { VaultAttachment, VaultItem } from '@lockpass/core'
import type { SupportedLocale } from '@/i18n'
import { quickSearchItemCopyValue } from '@/services/desktopQuickSearchModel'
import { isTauriRuntime } from '@/services/runtime'
import type { ColorTheme } from '@/services/vaultRepository'

export { quickSearchItemCopyValue }

const MAIN_WINDOW_LABEL = 'main'
const QUICK_SEARCH_WINDOW_LABEL = 'quick-search'
const QUICK_SEARCH_UPDATED_EVENT = 'lockpass://quick-search-updated'
const QUICK_SEARCH_COPY_EVENT = 'lockpass://quick-search-copy'

export interface DesktopQuickSearchPayload {
  items: VaultItem[]
  attachments: VaultAttachment[]
  query: string
  locale: SupportedLocale
  theme: ColorTheme
}

export interface DesktopQuickSearchCopyRequest {
  value: string
  itemId: string | null
  message: 'copied' | 'copiedPassword'
}

export function isDesktopQuickSearchWindow(): boolean {
  return isTauriRuntime() && getCurrentWindow().label === QUICK_SEARCH_WINDOW_LABEL
}

export async function showDesktopQuickSearchWindow(
  payload: DesktopQuickSearchPayload,
): Promise<boolean> {
  if (!isTauriRuntime()) return false
  await invoke<void>('show_quick_search_window', { payload })
  return true
}

export async function closeDesktopQuickSearchWindow(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke<void>('close_quick_search_window')
}

export async function cacheDesktopQuickSearchPayload(
  payload: DesktopQuickSearchPayload,
): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke<void>('set_quick_search_payload', { payload })
}

export async function clearDesktopQuickSearchPayload(): Promise<void> {
  if (!isTauriRuntime()) return
  await invoke<void>('clear_quick_search_payload')
}

export async function loadDesktopQuickSearchPayload(): Promise<DesktopQuickSearchPayload | null> {
  if (!isTauriRuntime()) return null
  return invoke<DesktopQuickSearchPayload | null>('quick_search_payload')
}

export async function sendDesktopQuickSearchCopy(
  request: DesktopQuickSearchCopyRequest,
): Promise<void> {
  if (!isTauriRuntime()) return
  await emitTo(MAIN_WINDOW_LABEL, QUICK_SEARCH_COPY_EVENT, request)
}

export async function startDesktopQuickSearchCopyListener(
  handler: (request: DesktopQuickSearchCopyRequest) => void | Promise<void>,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined
  return listen<DesktopQuickSearchCopyRequest>(QUICK_SEARCH_COPY_EVENT, (event) => {
    if (!isDesktopQuickSearchCopyRequest(event.payload)) return
    void handler(event.payload)
  })
}

export async function startDesktopQuickSearchPayloadListener(
  handler: () => void | Promise<void>,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined
  return listen(QUICK_SEARCH_UPDATED_EVENT, () => {
    void handler()
  })
}

function isDesktopQuickSearchCopyRequest(
  value: unknown,
): value is DesktopQuickSearchCopyRequest {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<DesktopQuickSearchCopyRequest>
  return (
    typeof request.value === 'string' &&
    (request.itemId === null || typeof request.itemId === 'string') &&
    (request.message === 'copied' || request.message === 'copiedPassword')
  )
}
