import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateAddMoreMenuPosition } from "./addMoreMenuPosition";

const source = readFileSync(new URL("./AddMoreMenu.vue", import.meta.url), "utf8");

assert.match(
  source,
  /<Teleport to="body">/,
  "AddMoreMenu panel should be teleported out of scroll containers",
);
assert.match(
  source,
  /class="fixed z-\[1000\]/,
  "AddMoreMenu panel should use viewport positioning above the modal",
);
assert.doesNotMatch(
  source,
  /class="absolute bottom-10 left-0/,
  "AddMoreMenu panel should not be clipped by an overflow parent",
);
assert.match(
  source,
  /calculateAddMoreMenuPosition/,
  "AddMoreMenu should use the shared viewport positioning helper",
);

const belowPosition = calculateAddMoreMenuPosition({
  triggerRect: { left: 24, top: 260, bottom: 296, width: 136, height: 36 },
  panelRect: { width: 208, height: 224 },
  viewportWidth: 640,
  viewportHeight: 720,
});

assert.equal(
  belowPosition.top,
  302,
  "AddMoreMenu should open below the trigger when there is enough room",
);

const abovePosition = calculateAddMoreMenuPosition({
  triggerRect: { left: 359, top: 525, bottom: 561, width: 136, height: 36 },
  panelRect: { width: 208, height: 224 },
  viewportWidth: 1264,
  viewportHeight: 715,
});

assert.equal(
  abovePosition.top,
  295,
  "AddMoreMenu should open above the trigger when the bottom edge has too little room",
);
assert.equal(
  abovePosition.maxHeight,
  224,
  "AddMoreMenu should keep its full height when the upper side has enough room",
);

const constrainedPosition = calculateAddMoreMenuPosition({
  triggerRect: { left: 24, top: 640, bottom: 676, width: 136, height: 36 },
  panelRect: { width: 208, height: 360 },
  viewportWidth: 640,
  viewportHeight: 720,
});

assert.ok(
  constrainedPosition.top >= 12,
  "AddMoreMenu should stay inside the top viewport edge",
);
assert.ok(
  constrainedPosition.top + constrainedPosition.maxHeight <= 708,
  "AddMoreMenu should constrain height inside the bottom viewport edge",
);

console.log("addMoreMenu tests passed");
