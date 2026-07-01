import assert from "node:assert/strict";
import { normalizeItemFields } from "./normalize";

const normalized = normalizeItemFields([
  {
    id: "group-account",
    kind: "group",
    label: "Account",
    value: "",
    children: [
      {
        id: "username",
        kind: "username",
        label: "Username",
        value: "alice",
      },
      {
        id: "empty-note",
        kind: "note",
        label: "Note",
        value: "   ",
      },
    ],
  },
]);

assert.equal(normalized.length, 1);
assert.equal(normalized[0]?.kind, "group");
assert.equal(normalized[0]?.value, "");
assert.equal(normalized[0]?.children?.length, 1);
assert.equal(normalized[0]?.children?.[0]?.kind, "username");
assert.equal(normalized[0]?.children?.[0]?.value, "alice");
assert.equal(normalized[0]?.collapsed, undefined);

console.log("normalize tests passed");
