import { computed, ref } from 'vue'
import enUS from './en-US'
import zhCN, { type ServerWebMessages } from './zh-CN'

export type ServerWebLocale = 'zh-CN' | 'en-US'
const localeStorageKey = 'lockpass.server_web.locale'
export const supportedLocales: ServerWebLocale[] = ['zh-CN', 'en-US']

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
} as const satisfies Record<ServerWebLocale, ServerWebMessages>

type NestedMessagePaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${NestedMessagePaths<T[K]>}`
}[keyof T & string]

export type MessagePath = NestedMessagePaths<ServerWebMessages>
const currentLocale = ref<ServerWebLocale>(detectServerWebLocale())

const storedLocale = typeof localStorage === 'undefined' ? null : localStorage.getItem(localeStorageKey)
if (storedLocale === 'zh-CN' || storedLocale === 'en-US') {
  currentLocale.value = storedLocale
}

export function detectServerWebLocale(): ServerWebLocale {
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

export function setLocale(locale: ServerWebLocale) {
  currentLocale.value = locale
  localStorage.setItem(localeStorageKey, locale)
}

export function t(
  path: MessagePath,
  params?: Record<string, string | number>,
  locale: ServerWebLocale = currentLocale.value
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
