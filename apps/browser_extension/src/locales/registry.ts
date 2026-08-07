export const DEFAULT_EXTENSION_LOCALE = 'en-US' as const

export const EXTENSION_LOCALE_OPTIONS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' }
] as const

export type ExtensionLocale = (typeof EXTENSION_LOCALE_OPTIONS)[number]['value']

export function isExtensionLocale(value: unknown): value is ExtensionLocale {
  return EXTENSION_LOCALE_OPTIONS.some((option) => option.value === value)
}

export function resolveExtensionLocale(language: string | null | undefined): ExtensionLocale {
  const normalized = language?.trim().replace('_', '-').toLowerCase() ?? ''
  const exact = EXTENSION_LOCALE_OPTIONS.find((option) => option.value.toLowerCase() === normalized)
  if (exact) return exact.value

  const languageCode = normalized.split('-')[0]
  const related = EXTENSION_LOCALE_OPTIONS.find((option) => (
    option.value.toLowerCase().split('-')[0] === languageCode
  ))
  return related?.value ?? DEFAULT_EXTENSION_LOCALE
}
