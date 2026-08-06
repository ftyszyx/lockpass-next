import assert from 'node:assert/strict'
import type { VaultItemField } from '@lockpass/core'
import { reactive } from 'vue'
import { cloneVaultItemFields } from './itemEditorModel.ts'

const fields = reactive<VaultItemField[]>([
  {
    id: 'group-1',
    kind: 'group',
    label: 'Server',
    value: '',
    sensitive: false,
    collapsed: true,
    children: [
      {
        id: 'password-1',
        kind: 'password',
        label: 'Password',
        value: 'secret',
        sensitive: true
      }
    ]
  }
])

const cloned = cloneVaultItemFields(fields)

assert.deepEqual(cloned, fields)
assert.notEqual(cloned, fields)
assert.notEqual(cloned[0], fields[0])
assert.notEqual(cloned[0]?.children, fields[0]?.children)

cloned[0]!.label = 'Changed'
cloned[0]!.children![0]!.value = 'changed-secret'

assert.equal(fields[0]?.label, 'Server')
assert.equal(fields[0]?.children?.[0]?.value, 'secret')

console.log('extension item editor model tests passed')
