import assert from "node:assert/strict";
import type { VaultItem } from "@lockpass/core";
import {
  chunkArray,
  countItemsByVault,
  mergeById,
} from "./syncObjects";

assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(chunkArray([], 2), []);

assert.deepEqual(
  mergeById(
    [
      { id: "one", value: 1 },
      { id: "two", value: 2 },
    ],
    [
      { id: "two", value: 20 },
      { id: "three", value: 3 },
    ],
  ),
  [
    { id: "one", value: 1 },
    { id: "two", value: 20 },
    { id: "three", value: 3 },
  ],
);

const item = (id: string, vaultId: string, deletedAt: string | null): VaultItem => ({
  id,
  vaultId,
  schemaVersion: 1,
  type: "login",
  title: id,
  subtitle: "",
  notes: "",
  urls: [],
  tags: [],
  favorite: false,
  archived: false,
  fields: [],
  attachmentIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  sync: {
    revision: 1,
    baseRevision: 0,
    updatedByDeviceId: "device-one",
    deletedAt,
    state: "clean",
  },
});

assert.deepEqual(
  countItemsByVault([
    item("one", "vault-one", null),
    item("two", "vault-one", "2026-01-02T00:00:00.000Z"),
    item("three", "vault-two", null),
  ]),
  {
    "vault-one": 1,
    "vault-two": 1,
  },
);

console.log("vault sync object tests passed");
