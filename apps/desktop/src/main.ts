import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { i18n, setI18nLocale } from './i18n'
import { router } from './router'
import { loadSystemLocale } from './services/locale'
import './styles.css'

setI18nLocale(await loadSystemLocale())

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
