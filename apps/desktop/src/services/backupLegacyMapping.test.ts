import assert from 'node:assert/strict'
import { legacyDecodedItemToImportItem, type ImportFieldLabelMap } from './backup'

const labels: ImportFieldLabelMap = {
  username: 'Username',
  password: 'Password',
  url: 'Website',
  note: 'Note',
  cardholder: 'Cardholder',
  cardNumber: 'Card number',
  expiry: 'Expiry',
  cvv: 'CVC',
}

const note = legacyDecodedItemToImportItem({
  vaultItemType: 'note',
  name: 'Legacy note',
  info: { note_text: 'The note body' },
  remarks: '',
}, labels)
assert.equal(note.notes, 'The note body')
assert.deepEqual(note.fields, [], 'the primary note body must not also become a custom note field')

const login = legacyDecodedItemToImportItem({
  vaultItemType: 'login',
  name: 'Legacy login',
  info: { username: 'alice', password: 'secret', urls: ['https://example.com'] },
  remarks: 'Login remark',
}, labels)
assert.equal(login.notes, '')
assert.equal(login.fields.find((field) => field.kind === 'note')?.value, 'Login remark')

console.log('legacy backup mapping tests passed')
