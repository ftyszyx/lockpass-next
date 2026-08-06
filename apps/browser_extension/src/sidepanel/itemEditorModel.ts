import type { VaultItem, VaultItemField, VaultItemFieldKind, VaultItemType } from '@lockpass/core'
import type { ExtensionItemSaveInput } from '../shared/models'

type Translate = (key: string) => string

export const creatableItemTypes: VaultItemType[] = [
  'login',
  'secure-note',
  'payment-card',
  'identity',
  'recovery-code'
]

export const addableFieldKinds: VaultItemFieldKind[] = [
  'text',
  'username',
  'password',
  'url',
  'email',
  'phone',
  'date',
  'totp',
  'secret',
  'note'
]

export function createItemEditorDraft(
  t: Translate,
  item: VaultItem | null,
  defaultVaultId: string
): ExtensionItemSaveInput {
  if (!item) {
    return {
      editingItemId: null,
      vaultId: defaultVaultId,
      type: 'login',
      title: '',
      notes: '',
      fields: createDefaultFields(t, 'login')
    }
  }

  return {
    editingItemId: item.id,
    vaultId: item.vaultId,
    type: item.type,
    title: item.title,
    notes: item.notes,
    fields: [
      ...item.urls.map((url) => createField(t, 'url', url)),
      ...cloneVaultItemFields(item.fields)
    ]
  }
}

export function cloneVaultItemFields(fields: VaultItemField[]): VaultItemField[] {
  return fields.map((field) => ({
    id: field.id,
    kind: field.kind,
    label: field.label,
    value: field.value,
    sensitive: field.sensitive,
    ...(field.collapsed === undefined ? {} : { collapsed: field.collapsed }),
    ...(field.children ? { children: cloneVaultItemFields(field.children) } : {})
  }))
}

export function createDefaultFields(t: Translate, type: VaultItemType): VaultItemField[] {
  if (type === 'secure-note' || type === 'attachment') return []
  if (type === 'payment-card') {
    return [
      createField(t, 'cardholder'),
      createField(t, 'card-number', '', true),
      createField(t, 'expiry'),
      createField(t, 'cvv', '', true)
    ]
  }
  if (type === 'identity') {
    return [createField(t, 'email'), createField(t, 'phone')]
  }
  if (type === 'recovery-code') {
    return [createField(t, 'recovery-code', '', true)]
  }
  return [
    createField(t, 'url'),
    createField(t, 'username'),
    createField(t, 'password', '', true)
  ]
}

export function createField(
  t: Translate,
  kind: VaultItemFieldKind,
  value = '',
  sensitive = isSensitiveKind(kind)
): VaultItemField {
  return {
    id: `field-${crypto.randomUUID()}`,
    kind,
    label: fieldKindLabel(t, kind),
    value,
    sensitive
  }
}

export function fieldKindLabel(t: Translate, kind: VaultItemFieldKind): string {
  const keys: Partial<Record<VaultItemFieldKind, string>> = {
    username: 'fields.username',
    password: 'fields.password',
    url: 'fields.website',
    email: 'fields.email',
    phone: 'fields.phone',
    text: 'fields.text',
    date: 'fields.date',
    totp: 'fields.totp',
    secret: 'fields.secret',
    note: 'fields.note',
    cardholder: 'fields.cardholder',
    'card-number': 'fields.cardNumber',
    expiry: 'fields.expiry',
    cvv: 'fields.cvv',
    'recovery-code': 'fields.recoveryCode',
    attachment: 'type.attachment',
    group: 'fields.group'
  }
  return t(keys[kind] ?? 'fields.text')
}

export function isTextareaKind(kind: VaultItemFieldKind): boolean {
  return kind === 'note'
}

export function fieldInputType(field: VaultItemField): string {
  if (field.kind === 'date') return 'date'
  if (field.kind === 'url') return 'url'
  if (field.kind === 'email') return 'email'
  if (field.kind === 'phone') return 'tel'
  return field.sensitive ? 'password' : 'text'
}

function isSensitiveKind(kind: VaultItemFieldKind): boolean {
  return ['password', 'secret', 'totp', 'cvv', 'card-number', 'recovery-code'].includes(kind)
}
