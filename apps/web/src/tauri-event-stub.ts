export type UnlistenFn = () => void

export async function listen(): Promise<UnlistenFn> {
  return () => undefined
}

export async function emitTo(): Promise<void> {
  return undefined
}
