import assert from 'node:assert/strict'
import { DEFAULT_SHORTCUT_SETTINGS } from './shortcuts'
import {
  createGlobalShortcutBindings,
  dispatchGlobalShortcutAction,
} from './globalShortcuts'

assert.deepEqual(
  createGlobalShortcutBindings(DEFAULT_SHORTCUT_SETTINGS.global),
  [
    { action: 'quickSearch', shortcut: 'Control+Shift+O' },
    { action: 'lock', shortcut: 'Control+Shift+L' },
    { action: 'showMainWindow', shortcut: 'Control+Shift+ArrowUp' },
    { action: 'hideMainWindow', shortcut: 'Control+Shift+ArrowDown' },
  ],
)

const calls: string[] = []
const handlers = {
  quickSearch: () => { calls.push('quickSearch') },
  lock: () => { calls.push('lock') },
  showMainWindow: () => { calls.push('showMainWindow') },
  hideMainWindow: () => { calls.push('hideMainWindow') },
}

assert.equal(dispatchGlobalShortcutAction('quickSearch', handlers), true)
assert.equal(dispatchGlobalShortcutAction('unknown', handlers), false)
await Promise.resolve()
assert.deepEqual(calls, ['quickSearch'])

console.log('global shortcut service tests passed')
