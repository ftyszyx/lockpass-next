export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function isUserWebRuntime(): boolean {
  return Boolean(import.meta.env.VITE_LOCKPASS_USER_WEB_APP)
}
