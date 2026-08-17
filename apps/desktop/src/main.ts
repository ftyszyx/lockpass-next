import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n, setI18nLocale } from './i18n'
import QuickSearchWindowPage from './pages/desktop/QuickSearchWindowPage.vue'
import { router } from './router'
import { isDesktopQuickSearchWindow } from './services/desktopQuickSearch'
import { loadSystemLocale } from './services/locale'
import { applyColorTheme } from './services/theme'
import './styles.css'
import './theme.css'

applyColorTheme('system')
setI18nLocale(await loadSystemLocale())

const quickSearchWindow = isDesktopQuickSearchWindow()
document.body.classList.toggle('quick-search-window', quickSearchWindow)

const app = createApp(quickSearchWindow ? QuickSearchWindowPage : App)
  .use(createPinia())
  .use(i18n)

if (!quickSearchWindow) app.use(router)

app.mount('#app')
