export async function invoke<T = unknown>(): Promise<T> {
  throw new Error('Tauri commands are unavailable in the LockPass user web app')
}
