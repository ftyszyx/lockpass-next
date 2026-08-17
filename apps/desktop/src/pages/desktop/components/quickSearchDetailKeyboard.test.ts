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

assert.match(
  modalSource,
  /event\.key === 'Escape' \|\| event\.key === 'ArrowLeft'/,
  'Quick-search detail should return to results with Escape or ArrowLeft',
)
assert.match(
  modalSource,
  /detailView\.value\?\.moveSelection/,
  'Quick-search detail should delegate ArrowUp and ArrowDown navigation',
)
assert.match(
  modalSource,
  /detailView\.value\?\.copySelectedRow\(\)/,
  'Quick-search detail should copy the selected row with Enter',
)
assert.match(
  detailSource,
  /scrollIntoView\(\{ block: 'nearest' \}\)/,
  'Quick-search detail should keep the selected row visible',
)
assert.match(
  detailSource,
  /emit\('copyValue', row\.value\)/,
  'Quick-search detail should copy the actual row value',
)

console.log('quick search detail keyboard tests passed')
