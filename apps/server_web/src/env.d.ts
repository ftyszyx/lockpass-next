/// <reference types="vite/client" />

import type { MessagePath } from './i18n'

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean
    requiresAdmin?: boolean
    titleKey?: MessagePath
  }
}
