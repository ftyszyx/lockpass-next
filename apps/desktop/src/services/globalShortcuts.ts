import { invoke } from '@tauri-apps/api/core'
import { GLOBAL_SHORTCUT_ACTIONS, toTauriGlobalShortcut } from '@/services/shortcuts'
import type {
  DesktopShortcutSettings,
  GlobalShortcutAction,
} from '@/services/vaultRepository'

type GlobalShortcutSettings = DesktopShortcutSettings['global']

export type GlobalShortcutActionHandler = () => void | Promise<void>
export type GlobalShortcutActionHandlers = Record<
  GlobalShortcutAction,
  GlobalShortcutActionHandler
>

export interface GlobalShortcutRegistrationResult {
  failedActions: GlobalShortcutAction[]
  supported: boolean
}

interface GlobalShortcutBinding {
  action: GlobalShortcutAction
  shortcut: string
}

let activeHandlers: GlobalShortcutActionHandlers | null = null
let activeErrorHandler:
  | ((action: GlobalShortcutAction, error: unknown) => void)
  | undefined
let pollTimer: number | null = null
let drainInFlight = false
let pendingUpdate: Promise<void> = Promise.resolve()

export function createGlobalShortcutBindings(
  settings: GlobalShortcutSettings,
): GlobalShortcutBinding[] {
  return GLOBAL_SHORTCUT_ACTIONS.map((action) => ({
    action,
    shortcut: toTauriGlobalShortcut(settings[action]),
  }))
}

export function dispatchGlobalShortcutAction(
  action: unknown,
  handlers: GlobalShortcutActionHandlers,
  onActionError?: (action: GlobalShortcutAction, error: unknown) => void,
): boolean {
  if (!isGlobalShortcutAction(action)) return false
  Promise.resolve(handlers[action]()).catch((error) => {
    onActionError?.(action, error)
  })
  return true
}

export async function replaceDesktopGlobalShortcuts(
  settings: GlobalShortcutSettings,
  handlers: GlobalShortcutActionHandlers,
  onActionError?: (action: GlobalShortcutAction, error: unknown) => void,
): Promise<GlobalShortcutRegistrationResult> {
  if (!isTauriRuntime()) return { failedActions: [], supported: false }

  activeHandlers = handlers
  activeErrorHandler = onActionError
  const failedActions = await enqueue(async () => {
    ensurePolling()
    return invoke<GlobalShortcutAction[]>('replace_global_shortcuts', {
      bindings: createGlobalShortcutBindings(settings),
    })
  })
  return { failedActions, supported: true }
}

export async function stopDesktopGlobalShortcuts(): Promise<void> {
  activeHandlers = null
  activeErrorHandler = undefined
  if (pollTimer !== null) window.clearInterval(pollTimer)
  pollTimer = null
  if (!isTauriRuntime()) return
  await enqueue(() => invoke<void>('stop_global_shortcuts'))
}

export function showDesktopWindow(): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve()
  return invoke<void>('show_desktop_window')
}

export function hideDesktopWindow(): Promise<void> {
  if (!isTauriRuntime()) return Promise.resolve()
  return invoke<void>('hide_desktop_window')
}

function ensurePolling(): void {
  if (pollTimer !== null) return
  void drainPendingActions()
  pollTimer = window.setInterval(() => {
    void drainPendingActions()
  }, 100)
}

async function drainPendingActions(): Promise<void> {
  if (drainInFlight || !activeHandlers) return
  drainInFlight = true
  try {
    const actions = await invoke<unknown[]>('take_pending_global_shortcuts')
    for (const action of actions) {
      dispatchGlobalShortcutAction(action, activeHandlers, activeErrorHandler)
    }
  } catch {
    // Registration errors are reported separately; keep the poller quiet.
  } finally {
    drainInFlight = false
  }
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingUpdate.then(operation, operation)
  pendingUpdate = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

function isGlobalShortcutAction(value: unknown): value is GlobalShortcutAction {
  return GLOBAL_SHORTCUT_ACTIONS.some((action) => action === value)
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
