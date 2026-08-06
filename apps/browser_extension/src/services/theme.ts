import type { ExtensionTheme } from '@/shared/models'

const DARK_QUERY = '(prefers-color-scheme: dark)'
let selectedTheme: ExtensionTheme = 'system'
let mediaQuery: MediaQueryList | null = null

export function applyExtensionTheme(theme: ExtensionTheme): void {
  selectedTheme = theme
  if (!mediaQuery) {
    mediaQuery = window.matchMedia(DARK_QUERY)
    mediaQuery.addEventListener('change', applyResolvedTheme)
  }
  applyResolvedTheme()
}

function applyResolvedTheme(): void {
  const resolved = selectedTheme === 'system'
    ? (mediaQuery?.matches ? 'dark' : 'light')
    : selectedTheme
  document.documentElement.dataset.theme = resolved
  document.documentElement.dataset.themePreference = selectedTheme
  document.documentElement.style.colorScheme = resolved
}
