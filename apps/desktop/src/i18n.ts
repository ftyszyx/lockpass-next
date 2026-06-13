import { createI18n } from 'vue-i18n'
import enUS from '@/locales/en-US'
import zhCN from '@/locales/zh-CN'
import { detectBrowserLocale } from '@/services/locale'

export const supportedLocales = ['zh-CN', 'en-US'] as const

export type SupportedLocale = (typeof supportedLocales)[number]

export const localeLabels: Record<SupportedLocale, string> = {
  'zh-CN': '简体中文',
  'en-US': 'English'
}

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
}

export const desktopMessages = messages

export const i18n = createI18n({
  legacy: false,
  locale: detectBrowserLocale(),
  fallbackLocale: 'en-US',
  messages
})

export function setI18nLocale(locale: SupportedLocale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}
