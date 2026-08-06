import { createApp } from 'vue'
import SidePanelApp from '@/sidepanel/SidePanelApp.vue'
import { i18n } from '@/i18n'
import '@/styles.css'

createApp(SidePanelApp).use(i18n).mount('#app')
