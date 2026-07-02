import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("./ItemEditorModal.vue", import.meta.url),
  "utf8",
);

assert.match(
  source,
  /import Draggable from "vuedraggable"/,
  "ItemEditorModal should use the maintained vuedraggable Vue 3 component",
);
assert.match(
  source,
  /class="vault-field-list/,
  "field lists should expose a shared class for transition styling",
);
assert.doesNotMatch(
  source,
  /tag="transition-group"/,
  "field lists should not use TransitionGroup because vuedraggable can receive null item nodes during conditional updates",
);
assert.match(
  source,
  /const fieldDragOptions = \{/,
  "field sorting should share one SortableJS option set across editor sections",
);
assert.match(
  source,
  /animation: 180/,
  "field sorting should enable SortableJS animation during drag",
);
assert.match(
  source,
  /forceFallback: true/,
  "field sorting should use fallback dragging for stable WebView2 behavior",
);
assert.match(
  source,
  /fallbackOnBody: true/,
  "field sorting should append fallback drag clones to the body so they are not clipped by modal scroll containers",
);
assert.match(
  source,
  /scrollSensitivity: 72/,
  "field sorting should start auto-scroll before the pointer reaches the modal footer",
);
assert.match(
  source,
  /handle: "\.drag-handle"/,
  "field sorting should be driven by the visible drag handle",
);
assert.match(
  source,
  /v-bind="fieldDragOptions"/,
  "field lists should receive the shared drag options",
);
assert.match(
  source,
  /class="[^"]*drag-handle/,
  "field rows should expose a drag-handle class for SortableJS",
);
assert.match(
  source,
  /:move="canMoveFieldDrag"/,
  "field sorting should block non-draggable built-in fields through SortableJS move validation",
);
assert.match(
  source,
  /function fieldTitleRowClasses\(field: VaultItemField\): string/,
  "field title rows should choose their grid layout from field drag capability",
);
assert.match(
  source,
  /canDragField\(field\)\s*\?\s*"grid-cols-\[24px_minmax\(0,1fr\)_auto\]"\s*:\s*"grid-cols-\[minmax\(0,1fr\)_auto\]"/,
  "non-draggable built-in fields should not reserve an empty drag-handle column before their labels",
);
assert.match(
  source,
  /:class="fieldTitleRowClasses\(field\)"/,
  "main field title rows should use conditional columns so built-in labels align with inputs",
);
const websiteFieldsBlock = source.slice(
  source.indexOf('v-model="sortableWebsiteFields"'),
  source.indexOf('@click="emit(\'addWebsite\')"'),
);
assert.match(
  websiteFieldsBlock,
  /v-if="!fieldLabelEditable\(field\)"/,
  "login website fields should render fixed labels only for built-in fields",
);
assert.match(
  websiteFieldsBlock,
  /v-model="field\.label"/,
  "login website fields added by the user should have editable titles",
);
assert.match(
  source,
  /v-model="sortableMainFields"/,
  "main item fields should sort through a computed setter that writes back to draft fields",
);
assert.doesNotMatch(
  source,
  /sortableCardContactFields|contactInfo/,
  "payment cards should not render a dedicated contact information block; users can add custom fields through Add more",
);
assert.match(
  source,
  /:list="groupChildren\(field\)"/,
  "group children should use nested vuedraggable lists",
);
assert.match(
  source,
  /ghostClass: "vault-field-ghost"/,
  "field sorting should use a visible ghost class during drag",
);
assert.match(
  source,
  /\.vault-field-list\s*>\s*\[data-draggable="true"\]/,
  "field rows should define lightweight transition styling while SortableJS animates dragging",
);
assert.match(
  source,
  /\.vault-field-ghost/,
  "field sorting should style the SortableJS ghost row while dragging",
);
assert.match(
  source,
  /const needsEditorScrollBuffer = computed/,
  "the editor should only reserve extra footer space once the form needs scrolling",
);
assert.match(
  source,
  /needsEditorScrollBuffer\.value \? "pb-24" : "pb-2"/,
  "short item forms should stay compact while long forms keep room above the modal footer",
);

const mainFieldsIndex = source.indexOf('v-model="sortableMainFields"');
const secureNoteIndex = source.indexOf("v-if=\"draft.type === 'secure-note'\"");
assert.ok(mainFieldsIndex >= 0, "ItemEditorModal should render mainFields");
assert.ok(
  secureNoteIndex >= 0,
  "ItemEditorModal should render secure note body",
);
assert.ok(
  secureNoteIndex < mainFieldsIndex,
  "secure note body should render before user-added fields so new fields append after existing fields",
);

console.log("itemEditorDrag tests passed");
