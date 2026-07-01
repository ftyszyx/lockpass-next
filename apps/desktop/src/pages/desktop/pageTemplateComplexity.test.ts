import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./DesktopVaultPage.vue", import.meta.url), "utf8");

function componentOpeningLineCount(componentName: string): number {
  const match = source.match(new RegExp(`<${componentName}(?:\\s[^>]*)?\\s*/>`, "m"));
  assert.ok(match, `${componentName} opening tag should exist`);
  return match[0].split(/\r?\n/).length;
}

assert.ok(
  componentOpeningLineCount("DesktopVaultWorkspace") <= 3,
  "DesktopVaultWorkspace should not be wired through a long prop/event bridge",
);
assert.ok(
  componentOpeningLineCount("DesktopVaultModalLayer") <= 3,
  "DesktopVaultModalLayer should not be wired through a long prop/event bridge",
);

console.log("desktop page template complexity tests passed");
