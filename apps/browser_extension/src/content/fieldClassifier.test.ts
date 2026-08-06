import assert from 'node:assert/strict'
import { classifyLoginField, type LoginFieldDescriptor } from './fieldClassifier.ts'

function field(input: Partial<LoginFieldDescriptor>): LoginFieldDescriptor {
  return {
    type: 'text',
    autocomplete: '',
    name: '',
    id: '',
    placeholder: '',
    ariaLabel: '',
    disabled: false,
    readOnly: false,
    ...input
  }
}

assert.equal(classifyLoginField(field({ type: 'email' })), 'username')
assert.equal(classifyLoginField(field({ autocomplete: 'username' })), 'username')
assert.equal(classifyLoginField(field({ placeholder: '手机号/用户名/邮箱' })), 'username')
assert.equal(classifyLoginField(field({ type: 'password' })), 'currentPassword')
assert.equal(classifyLoginField(field({ type: 'password', autocomplete: 'new-password' })), 'newPassword')
assert.equal(classifyLoginField(field({ type: 'search', placeholder: 'Search' })), 'ignored')
assert.equal(classifyLoginField(field({ type: 'password', disabled: true })), 'ignored')

console.log('field classifier tests passed')
