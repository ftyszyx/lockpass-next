import assert from "node:assert/strict";
import type { Vault } from "@lockpass/core";
import {
  resetObjectsMissingFromSyncSnapshot,
  vaultObjectsHaveSameContent,
} from "./syncReconciliation";

const vault = (id: string, name: string, state: Vault["sync"]["state"]): Vault => ({
  id,
  schemaVersion: 1,
  name,
  description: "",
  color: "slate",
  icon: "folder-lock",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sync: {
    revision: state === "clean" ? 8 : 1,
    baseRevision: state === "clean" ? 8 : 0,
    updatedByDeviceId: state === "clean" ? "server-device" : "local-device",
    deletedAt: null,
    state,
  },
});

assert.equal(
  vaultObjectsHaveSameContent(
    vault("vault-11111111-1111-4111-8111-111111111111", "Personal", "conflicted"),
    vault("vault-11111111-1111-4111-8111-111111111111", "Personal", "clean"),
  ),
  true,
);
assert.equal(
  vaultObjectsHaveSameContent(
    vault("vault-11111111-1111-4111-8111-111111111111", "Personal", "conflicted"),
    vault("vault-11111111-1111-4111-8111-111111111111", "Work", "clean"),
  ),
  false,
);

const existingRemoteVault = vault(
  "vault-11111111-1111-4111-8111-111111111111",
  "Personal",
  "clean",
);
const localOnlyVault = vault(
  "vault-22222222-2222-4222-8222-222222222222",
  "Local only",
  "clean",
);
const resetCount = resetObjectsMissingFromSyncSnapshot(
  [existingRemoteVault, localOnlyVault],
  [],
  [],
  [
    {
      syncSpaceId: "space-one",
      objectId: "11111111-1111-4111-8111-111111111111",
      vaultId: "11111111-1111-4111-8111-111111111111",
      objectType: "vault_metadata",
      revision: 8,
      encryptedPayload: {} as never,
    },
  ],
  "local-device",
);
assert.equal(resetCount, 1);
assert.equal(existingRemoteVault.sync.state, "clean");
assert.deepEqual(localOnlyVault.sync, {
  revision: 1,
  baseRevision: 0,
  updatedByDeviceId: "local-device",
  deletedAt: null,
  state: "dirty",
});

console.log("vault sync reconciliation tests passed");
