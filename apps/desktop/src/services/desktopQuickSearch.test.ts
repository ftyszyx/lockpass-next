import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { VaultItem } from '@lockpass/core'
import { quickSearchItemCopyValue } from './desktopQuickSearchModel'

const baseItem = {
  id: 'item-1',
  title: 'Example account',
  fields: [],
} as unknown as VaultItem

assert.equal(quickSearchItemCopyValue(baseItem), 'Example account')
assert.equal(
  quickSearchItemCopyValue({
    ...baseItem,
    fields: [
      {
        id: 'password-1',
        kind: 'password',
        label: 'Password',
        value: 'secret-value',
        sensitive: true,
      },
    ],
  }),
  'secret-value',
)

const windowPageSource = readFileSync(
  new URL('../pages/desktop/QuickSearchWindowPage.vue', import.meta.url),
  'utf8',
)
const desktopPageSource = readFileSync(
  new URL('../pages/desktop/DesktopVaultPage.vue', import.meta.url),
  'utf8',
)

assert.match(
  windowPageSource,
  /finally \{\s*await closeDesktopQuickSearchWindow\(\)/,
  'Standalone quick search should close after every copy attempt',
)
assert.match(
  desktopPageSource,
  /function clearSensitiveUiState\(\): void \{\s*void clearDesktopQuickSearchPayload\(\)/,
  'Locking or switching users should close quick search and clear its payload',
)
assert.match(
  desktopPageSource,
  /activeModal\.value = null;\s*await copyValue\(value\);/,
  'Browser fallback should close its modal after copying a detail row',
)

console.log('desktop quick search window tests passed')
