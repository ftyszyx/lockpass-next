import { invoke } from '@tauri-apps/api/core'
import type { SupportedLocale } from '@/i18n'

const DEFAULT_LOCALE: SupportedLocale = 'en-US'
const WEB_LOCALE_STORAGE_KEY = 'lockpass.web.locale'

export async function loadSystemLocale(): Promise<SupportedLocale> {
  const savedLocale = loadSavedWebLocale()
  if (savedLocale) return savedLocale

  const candidates: Array<string | null | undefined> = []

  if (isTauriRuntime()) {
    candidates.push(await invoke<string | null>('system_locale'))
  }

  candidates.push(...navigator.languages, navigator.language)
  return toSupportedLocale(candidates)
}

export function detectBrowserLocale(): SupportedLocale {
  return loadSavedWebLocale() ?? toSupportedLocale([...navigator.languages, navigator.language])
}

export function saveWebLocale(locale: SupportedLocale): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(WEB_LOCALE_STORAGE_KEY, locale)
}

export function loadSavedWebLocale(): SupportedLocale | null {
  if (typeof localStorage === 'undefined') return null
  const saved = localStorage.getItem(WEB_LOCALE_STORAGE_KEY)
  return saved === 'zh-CN' || saved === 'en-US' ? saved : null
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
