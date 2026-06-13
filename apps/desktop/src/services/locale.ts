import { invoke } from '@tauri-apps/api/core'
import type { SupportedLocale } from '@/i18n'

const DEFAULT_LOCALE: SupportedLocale = 'en-US'

export async function loadSystemLocale(): Promise<SupportedLocale> {
  const candidates: Array<string | null | undefined> = []

  if (isTauriRuntime()) {
    candidates.push(await invoke<string | null>('system_locale'))
  }

  candidates.push(...navigator.languages, navigator.language)
  return toSupportedLocale(candidates)
}

export function detectBrowserLocale(): SupportedLocale {
  return toSupportedLocale([...navigator.languages, navigator.language])
}

export function toSupportedLocale(candidates: Array<string | null | undefined>): SupportedLocale {
  for (const candidate of candidates) {
    const normalized = candidate?.toLowerCase()
    if (!normalized) continue

    if (normalized.startsWith('zh')) return 'zh-CN'
    if (normalized.startsWith('en')) return 'en-US'
  }

  return DEFAULT_LOCALE
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
