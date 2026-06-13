/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCKPASS_OFFICIAL_SERVER_URL?: string
  readonly VITE_LOCKPASS_OFFICIAL_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '@tauri-apps/plugin-deep-link' {
  import type { UnlistenFn } from '@tauri-apps/api/event'

  export function getCurrent(): Promise<string[] | null>
  export function onOpenUrl(handler: (urls: string[]) => void): Promise<UnlistenFn>
  export function register(protocol: string): Promise<null>
  export function unregister(protocol: string): Promise<null>
  export function isRegistered(protocol: string): Promise<boolean>
}
