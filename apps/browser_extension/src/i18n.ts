import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US'
import zhCN from './locales/zh-CN'
import { resolveExtensionLocale, type ExtensionLocale } from './locales/registry'

const messages: Record<ExtensionLocale, typeof zhCN> = {
  'zh-CN': zhCN,
  'en-US': enUS
}

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en-US',
  messages
})

export function setExtensionLocale(locale: ExtensionLocale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

function detectLocale(): ExtensionLocale {
  return resolveExtensionLocale(navigator.language)
}
