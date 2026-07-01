import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./ItemEditorModal.vue", import.meta.url),
  "utf8",
);

assert.match(
  source,
  /function canDragField\(field: VaultItemField\): boolean/,
  "ItemEditorModal should separate draggable fields from drop targets",
);
assert.match(
  source,
  /function canDropOnField\(field: VaultItemField\): boolean/,
  "ItemEditorModal should allow fixed fields to act as drop targets",
);
assert.doesNotMatch(
  source,
  /function dragFieldOver[\s\S]*?if \(!canMoveField\(field\)/,
  "dragover should not reject drops just because the target field is fixed",
);
assert.doesNotMatch(
  source,
  /function dropFieldOn[\s\S]*?if \(!canMoveField\(field\)/,
  "drop should not reject drops just because the target field is fixed",
);

console.log("itemEditorDrag tests passed");
