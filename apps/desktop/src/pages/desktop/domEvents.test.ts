import assert from "node:assert/strict";
import { isEventOutsideElement } from "./domEvents";

const insideTarget = {};
const outsideTarget = {};
const element = {
  contains(target: EventTarget | null) {
    return target === insideTarget;
  },
};

assert.equal(
  isEventOutsideElement({ target: insideTarget as EventTarget }, element),
  false,
);
assert.equal(
  isEventOutsideElement({ target: outsideTarget as EventTarget }, element),
  true,
);
assert.equal(
  isEventOutsideElement({ target: outsideTarget as EventTarget }, null),
  false,
);

console.log("domEvents tests passed");
