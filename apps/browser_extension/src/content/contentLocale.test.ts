import assert from 'node:assert/strict'
import { contentLabels } from './contentLocale.ts'

assert.equal(contentLabels('zh-CN').openVault, '打开保险库')
assert.equal(contentLabels('en-US').openVault, 'Open vault')

console.log('content locale tests passed')
