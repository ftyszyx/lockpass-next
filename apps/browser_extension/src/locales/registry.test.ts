import assert from 'node:assert/strict'
import {
  DEFAULT_EXTENSION_LOCALE,
  isExtensionLocale,
  resolveExtensionLocale
} from './registry.ts'

assert.equal(resolveExtensionLocale('zh-CN'), 'zh-CN')
assert.equal(resolveExtensionLocale('zh-TW'), 'zh-CN')
assert.equal(resolveExtensionLocale('en-GB'), 'en-US')
assert.equal(resolveExtensionLocale('fr-FR'), DEFAULT_EXTENSION_LOCALE)
assert.equal(resolveExtensionLocale(undefined), DEFAULT_EXTENSION_LOCALE)
assert.equal(isExtensionLocale('zh-CN'), true)
assert.equal(isExtensionLocale('ja-JP'), false)

console.log('extension locale registry tests passed')
