import type { ColorTheme } from "@/services/vaultRepository";

const DARK_MODE_QUERY = "(prefers-color-scheme: dark)";

let selectedTheme: ColorTheme = "system";
let systemThemeQuery: MediaQueryList | null = null;

export function applyColorTheme(theme: ColorTheme): void {
  selectedTheme = theme;
  ensureSystemThemeListener();
  applyResolvedTheme();
}

function ensureSystemThemeListener(): void {
  if (systemThemeQuery || typeof window === "undefined" || !window.matchMedia)
    return;

  systemThemeQuery = window.matchMedia(DARK_MODE_QUERY);
  systemThemeQuery.addEventListener("change", handleSystemThemeChange);
}

function handleSystemThemeChange(): void {
  if (selectedTheme === "system") applyResolvedTheme();
}

function applyResolvedTheme(): void {
  if (typeof document === "undefined") return;

  const resolvedTheme = resolveColorTheme(selectedTheme);
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themePreference = selectedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
}

function resolveColorTheme(theme: ColorTheme): Exclude<ColorTheme, "system"> {
  if (theme !== "system") return theme;
  return systemThemeQuery?.matches ? "dark" : "light";
}
