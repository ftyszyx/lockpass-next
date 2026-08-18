import assert from 'node:assert/strict'
import type { Vault } from '@lockpass/core'
import { countVisibleVaultItems } from './getters'

const vault = (id: string, deletedAt: string | null = null): Vault => ({
  id,
  sync: { deletedAt },
} as unknown as Vault)

assert.equal(
  countVisibleVaultItems({
    vaults: [vault('vault-current'), vault('vault-deleted', '2026-08-01T00:00:00.000Z')],
    vaultItemCounts: {
      'vault-current': 480,
      'vault-deleted': 959,
      'vault-orphan': 123,
    },
  }),
  480,
)

assert.equal(
  countVisibleVaultItems({
    vaults: [vault('vault-one'), vault('vault-two')],
    vaultItemCounts: { 'vault-one': 4, 'vault-two': 6 },
  }),
  10,
)

console.log('vault getter tests passed')
