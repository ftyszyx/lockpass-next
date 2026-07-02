import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pageSource = readFileSync(
  new URL("./DesktopVaultPage.vue", import.meta.url),
  "utf8",
);
const modalLayerSource = readFileSync(
  new URL("./components/DesktopVaultModalLayer.vue", import.meta.url),
  "utf8",
);

assert.match(
  modalLayerSource,
  /@toggle-group="page\.toggleDraftGroup"/,
  "DesktopVaultModalLayer should route group toggle events through page context",
);

const itemEditorBindings =
  pageSource.match(/const\s*{([\s\S]*?)}\s*=\s*useItemEditor\(/)?.[1] ?? "";
assert.match(
  itemEditorBindings,
  /\btoggleDraftGroup\b/,
  "DesktopVaultPage should expose toggleDraftGroup from useItemEditor",
);

const providedContext =
  pageSource.match(/reactive\(\s*{([\s\S]*?)}\s*,?\s*\)\s*\);/)?.[1] ?? "";
assert.match(
  providedContext,
  /\btoggleDraftGroup\b/,
  "DesktopVaultPage should provide toggleDraftGroup to modal components",
);

console.log("desktopPageContext tests passed");
