import { createI18n } from 'vue-i18n'
import enUS from './locales/en-US'
import zhCN from './locales/zh-CN'
import type { ExtensionLocale } from './shared/models'

export const i18n = createI18n({
  legacy: false,
  locale: detectLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

export function setExtensionLocale(locale: ExtensionLocale): void {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}

function detectLocale(): ExtensionLocale {
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US'
}
