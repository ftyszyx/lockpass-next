import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const themeService = read("./theme.ts");
const themeStyles = read("../theme.css");
const model = read("../stores/vault/model.ts");
const page = read("../pages/desktop/DesktopVaultPage.vue");
const webMain = read("../../../web/src/main.ts");
const managementPage = read(
  "../pages/desktop/components/ManagementPage.vue",
);

assert.match(
  model,
  /DEFAULT_THEME: ColorTheme = "system"/,
  "new and legacy settings should default to the system theme",
);
assert.match(
  model,
  /theme: normalizeTheme\(data\?\.settings\?\.theme\)/,
  "loaded settings should normalize the persisted theme",
);
assert.match(
  themeService,
  /matchMedia\(DARK_MODE_QUERY\)[\s\S]*addEventListener\("change"/,
  "system theme mode should respond to operating system appearance changes",
);
assert.match(
  themeService,
  /document\.documentElement\.dataset\.theme = resolvedTheme/,
  "the resolved theme should be applied to the document root",
);
assert.match(
  page,
  /applyColorTheme\(vaultStore\.settings\.theme\)[\s\S]*async function changeTheme/,
  "the desktop page should apply both loaded and newly selected themes",
);
assert.match(
  managementPage,
  /changeTheme: \[theme: ColorTheme\]/,
  "settings should expose a typed theme change event",
);
assert.match(
  managementPage,
  /value: "system"[\s\S]*value: "light"[\s\S]*value: "dark"[\s\S]*emit\('changeTheme', option\.value\)/,
  "settings should expose system, light, and dark theme controls",
);
assert.match(
  themeStyles,
  /:root\[data-theme="dark"\][\s\S]*--app-surface:[\s\S]*\.bg-white/,
  "dark mode should define application tokens and utility-class surface overrides",
);
assert.match(
  webMain,
  /import \{ applyColorTheme \} from ['"]@\/services\/theme['"][\s\S]*import ['"]@\/theme\.css['"][\s\S]*applyColorTheme\(['"]system['"]\)/,
  "the web entry should load and initialize the shared color theme",
);

console.log("theme tests passed");
