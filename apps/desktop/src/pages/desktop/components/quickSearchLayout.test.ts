import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const modalSource = readFileSync(
  new URL('./QuickSearchModal.vue', import.meta.url),
  'utf8',
)
const detailSource = readFileSync(
  new URL('./QuickSearchItemDetail.vue', import.meta.url),
  'utf8',
)
const mainSource = readFileSync(
  new URL('../../../main.ts', import.meta.url),
  'utf8',
)
const stylesSource = readFileSync(
  new URL('../../../styles.css', import.meta.url),
  'utf8',
)

assert.match(
  modalSource,
  /h-screen bg-\[var\(--app-surface-muted\)\] p-3/,
  'Standalone quick search should keep space between its panel and window edges',
)
assert.match(
  modalSource,
  /class="flex w-\[72px\] shrink-0 items-center justify-end gap-1 pr-1"/,
  'Every result row should reserve stable space for its action buttons',
)
assert.match(
  modalSource,
  /<Copy class="size-4" \/>/,
  'Every result row should expose a visible copy icon',
)
assert.match(
  modalSource,
  /<ChevronRight class="size-4" \/>/,
  'Every result row should expose a visible details arrow',
)
assert.match(
  detailSource,
  /fill \? 'h-full min-h-0 flex-1'/,
  'Standalone item details should fill the available window height',
)
assert.match(
  mainSource,
  /document\.body\.classList\.toggle\('quick-search-window', quickSearchWindow\)/,
  'The standalone window should receive its own body layout marker',
)
assert.match(
  stylesSource,
  /body\.quick-search-window\s*\{[\s\S]*?min-width:\s*0;/,
  'The standalone window must not inherit the main window minimum width',
)

console.log('quick search layout tests passed')
