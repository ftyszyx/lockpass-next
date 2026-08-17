import type { VaultItem } from '@lockpass/core'

export function quickSearchItemCopyValue(item: VaultItem): string {
  return item.fields.find((field) => field.kind === 'password')?.value ?? item.title
}
