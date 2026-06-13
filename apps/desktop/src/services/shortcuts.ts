import { invoke } from '@tauri-apps/api/core'
import type {
  DesktopShortcutSettings,
  GlobalShortcutAction,
  InternalShortcutAction,
  ShortcutAction,
  ShortcutScope
} from '@/services/vaultRepository'

export const DEFAULT_SHORTCUT_SETTINGS: DesktopShortcutSettings = {
  global: {
    quickSearch: 'Ctrl+Shift+O',
    lock: 'Ctrl+Shift+L',
    showMainWindow: 'Ctrl+Shift+Up',
    hideMainWindow: 'Ctrl+Shift+Down'
  },
  internal: {
    quickSearch: 'Ctrl+F',
    newItem: 'Ctrl+J',
    lock: 'Ctrl+L',
    passwordGenerator: 'Ctrl+G',
    settings: 'Ctrl+,',
    syncNow: 'Ctrl+R'
  }
}

export const GLOBAL_SHORTCUT_ACTIONS = ['quickSearch', 'lock', 'showMainWindow', 'hideMainWindow'] as const satisfies readonly GlobalShortcutAction[]
export const INTERNAL_SHORTCUT_ACTIONS = ['quickSearch', 'newItem', 'lock', 'passwordGenerator', 'settings', 'syncNow'] as const satisfies readonly InternalShortcutAction[]

export interface ShortcutConflict {
  type: 'duplicate' | 'system'
  action?: ShortcutAction
}

const SYSTEM_RESERVED_SHORTCUTS = new Set([
  'Ctrl+Alt+Delete',
  'Alt+Tab',
  'Alt+F4',
  'Ctrl+Shift+Esc',
  'Win+L',
  'Win+D',
  'Win+R',
  'Win+E',
  'Win+Tab',
  'Win+Shift+S'
])

export function normalizeShortcutSettings(settings: Partial<DesktopShortcutSettings> | null | undefined): DesktopShortcutSettings {
  return {
    global: normalizeShortcutGroup(settings?.global, DEFAULT_SHORTCUT_SETTINGS.global),
    internal: normalizeShortcutGroup(settings?.internal, DEFAULT_SHORTCUT_SETTINGS.internal)
  }
}

export function shortcutSettingsEqual(left: DesktopShortcutSettings, right: DesktopShortcutSettings): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function formatShortcutFromEvent(event: KeyboardEvent): string {
  const key = eventKeyToShortcutKey(event)
  if (!key) return ''

  const parts: string[] = []
  if (event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Win')
  parts.push(key)
  return normalizeShortcut(parts.join('+'))
}

export function normalizeShortcut(value: string): string {
  const tokens = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  const modifiers = new Set<string>()
  let key = ''

  for (const token of tokens) {
    const normalized = normalizeShortcutToken(token)
    if (!normalized) continue
    if (normalized === 'Ctrl' || normalized === 'Alt' || normalized === 'Shift' || normalized === 'Win') {
      modifiers.add(normalized)
    } else {
      key = normalized
    }
  }

  if (!key) return ''
  return [...['Ctrl', 'Alt', 'Shift', 'Win'].filter((modifier) => modifiers.has(modifier)), key].join('+')
}

export function isShortcutValid(shortcut: string, scope: ShortcutScope): boolean {
  const normalized = normalizeShortcut(shortcut)
  if (!normalized) return false
  const parts = normalized.split('+')
  const modifierCount = parts.length - 1
  if (scope === 'global') return modifierCount >= 2
  return modifierCount >= 1 || isFunctionKey(parts[parts.length - 1])
}

export async function findShortcutConflict(
  scope: ShortcutScope,
  action: ShortcutAction,
  shortcut: string,
  settings: DesktopShortcutSettings
): Promise<ShortcutConflict | null> {
  const normalized = normalizeShortcut(shortcut)
  if (!normalized) return null

  const duplicate = findDuplicateShortcut(scope, action, normalized, settings)
  if (duplicate) return { type: 'duplicate', action: duplicate }

  if (scope === 'global') {
    if (SYSTEM_RESERVED_SHORTCUTS.has(normalized)) return { type: 'system' }
    const availability = await checkGlobalShortcutAvailability(normalized)
    if (availability === 'unavailable') return { type: 'system' }
  }

  return null
}

export function shortcutMatchesEvent(shortcut: string, event: KeyboardEvent): boolean {
  if (isEditableKeyboardTarget(event.target)) return false
  return normalizeShortcut(shortcut) === formatShortcutFromEvent(event)
}

async function checkGlobalShortcutAvailability(shortcut: string): Promise<'available' | 'unavailable' | 'unsupported'> {
  if (!isTauriRuntime()) return 'unsupported'
  try {
    return invoke<'available' | 'unavailable' | 'unsupported'>('check_global_shortcut', { shortcut })
  } catch {
    return 'unsupported'
  }
}

function normalizeShortcutGroup<T extends Record<string, string>>(value: Partial<T> | undefined, defaults: T): T {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as Array<keyof T>) {
    const normalized = normalizeShortcut(String(value?.[key] ?? ''))
    result[key] = (normalized || defaults[key]) as T[keyof T]
  }
  return result
}

function findDuplicateShortcut(
  scope: ShortcutScope,
  action: ShortcutAction,
  shortcut: string,
  settings: DesktopShortcutSettings
): ShortcutAction | null {
  const entries = Object.entries(settings[scope]) as Array<[ShortcutAction, string]>
  return entries.find(([candidateAction, candidateShortcut]) =>
    candidateAction !== action && normalizeShortcut(candidateShortcut) === shortcut
  )?.[0] ?? null
}

function eventKeyToShortcutKey(event: KeyboardEvent): string {
  const key = event.key
  if (key === 'Control' || key === 'Alt' || key === 'Shift' || key === 'Meta') return ''
  if (key === ' ') return 'Space'
  if (key === 'ArrowUp') return 'Up'
  if (key === 'ArrowDown') return 'Down'
  if (key === 'ArrowLeft') return 'Left'
  if (key === 'ArrowRight') return 'Right'
  if (key.length === 1) return key.toUpperCase()
  return key.replace(/^Esc$/, 'Escape')
}

function normalizeShortcutToken(token: string): string {
  const value = token.toLowerCase()
  if (value === 'control' || value === 'ctrl') return 'Ctrl'
  if (value === 'option' || value === 'alt') return 'Alt'
  if (value === 'shift') return 'Shift'
  if (value === 'meta' || value === 'cmd' || value === 'command' || value === 'win' || value === 'windows') return 'Win'
  if (value === 'arrowup') return 'Up'
  if (value === 'arrowdown') return 'Down'
  if (value === 'arrowleft') return 'Left'
  if (value === 'arrowright') return 'Right'
  if (value === 'esc') return 'Escape'
  if (value === ' ') return 'Space'
  if (value.length === 1) return value.toUpperCase()
  if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(value)) return value.toUpperCase()
  return token.slice(0, 1).toUpperCase() + token.slice(1)
}

function isFunctionKey(key: string): boolean {
  return /^F([1-9]|1[0-9]|2[0-4])$/.test(key)
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}
