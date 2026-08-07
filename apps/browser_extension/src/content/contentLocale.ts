import { resolveExtensionLocale, type ExtensionLocale } from '../locales/registry.ts'

export interface ContentLabels {
  openQuickPanel: string
  loading: string
  unavailable: string
  noMatches: string
  generatePassword: string
  unlock: string
  openVault: string
}

const messages: Record<ExtensionLocale, ContentLabels> = {
  'zh-CN': {
    openQuickPanel: '打开 LockPass 快捷面板',
    loading: '正在查找登录信息...',
    unavailable: '暂时无法读取保险库',
    noMatches: '此网站没有匹配的登录信息',
    generatePassword: '生成密码',
    unlock: '解锁 LockPass',
    openVault: '打开保险库'
  },
  'en-US': {
    openQuickPanel: 'Open LockPass quick panel',
    loading: 'Finding logins...',
    unavailable: 'Vault is temporarily unavailable',
    noMatches: 'No matching logins for this site',
    generatePassword: 'Generate password',
    unlock: 'Unlock LockPass',
    openVault: 'Open vault'
  }
}

export function contentLabels(
  locale: ExtensionLocale = resolveExtensionLocale(navigator.language)
): ContentLabels {
  return messages[locale]
}
