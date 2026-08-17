import assert from 'node:assert/strict'
import {
  moveQuickSearchSelection,
  retainQuickSearchSelection,
} from './quickSearchNavigation'

assert.equal(moveQuickSearchSelection(-1, 0, 1), -1)
assert.equal(moveQuickSearchSelection(-1, 3, 1), 0)
assert.equal(moveQuickSearchSelection(0, 3, -1), 2)
assert.equal(moveQuickSearchSelection(2, 3, 1), 0)

assert.equal(retainQuickSearchSelection(null, []), null)
assert.equal(retainQuickSearchSelection(null, ['first', 'second']), 'first')
assert.equal(
  retainQuickSearchSelection('second', ['first', 'second']),
  'second',
)
assert.equal(
  retainQuickSearchSelection('missing', ['first', 'second']),
  'first',
)

console.log('quick search navigation tests passed')
