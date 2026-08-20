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
assert.match(
  modalLayerSource,
  /@add-user="page\.openAddUserFromManagement"/,
  "DesktopVaultModalLayer should route add-account events through page context",
);
assert.match(
  modalLayerSource,
  /@add-account="page\.openAddUserFromLock"/,
  "DesktopVaultModalLayer should route locked add-account events through page context",
);

const itemEditorBindings =
  pageSource.match(/const\s*{([\s\S]*?)}\s*=\s*useItemEditor\(/)?.[1] ?? "";
assert.match(
  itemEditorBindings,
  /\btoggleDraftGroup\b/,
  "DesktopVaultPage should expose toggleDraftGroup from useItemEditor",
);

const providedContext =
  pageSource.match(
    /provide\(\s*desktopPageContextKey,\s*reactive\(\s*{([\s\S]*?)}\s*,?\s*\)\s*,?\s*\);/,
  )?.[1] ?? "";
assert.match(
  providedContext,
  /\btoggleDraftGroup\b/,
  "DesktopVaultPage should provide toggleDraftGroup to modal components",
);
assert.match(
  providedContext,
  /\bopenAddUserFromManagement\b/,
  "DesktopVaultPage should provide openAddUserFromManagement to modal components",
);
assert.match(
  providedContext,
  /\bopenAddUserFromLock\b/,
  "DesktopVaultPage should provide openAddUserFromLock to modal components",
);

console.log("desktopPageContext tests passed");
