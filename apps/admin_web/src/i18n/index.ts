import { computed, ref } from 'vue'
import enUS from './en-US'
import zhCN, { type ServerWebMessages } from './zh-CN'

export type AdminWebLocale = 'zh-CN' | 'en-US'
export type ServerWebLocale = AdminWebLocale
const localeStorageKey = 'lockpass.admin_web.locale'
export const supportedLocales: AdminWebLocale[] = ['zh-CN', 'en-US']

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
} as const satisfies Record<AdminWebLocale, ServerWebMessages>

type NestedMessagePaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedMessagePaths<T[K]>}`
}[keyof T & string]

export type MessagePath = NestedMessagePaths<ServerWebMessages>
const currentLocale = ref<AdminWebLocale>(detectServerWebLocale())

const storedLocale = typeof localStorage === 'undefined' ? null : localStorage.getItem(localeStorageKey)
if (storedLocale === 'zh-CN' || storedLocale === 'en-US') {
  currentLocale.value = storedLocale
}

export function detectServerWebLocale(): AdminWebLocale {
  const language = navigator.language.toLowerCase()
  return language.startsWith('zh') ? 'zh-CN' : 'en-US'
}

export function useI18n() {
  return {
    locale: computed(() => currentLocale.value),
    supportedLocales,
    setLocale,
    t
  }
}

export function setLocale(locale: AdminWebLocale) {
  currentLocale.value = locale
  localStorage.setItem(localeStorageKey, locale)
}

export function t(
  path: MessagePath,
  params?: Record<string, string | number>,
  locale: AdminWebLocale = currentLocale.value
): string {
  const message = readMessage(messages[locale], path) ?? readMessage(messages['en-US'], path) ?? path
  if (!params) return message
  return Object.entries(params).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    message
  )
}

function readMessage(source: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[part]
  }, source)
  return typeof value === 'string' ? value : undefined
}
