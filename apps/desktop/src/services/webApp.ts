import { configuredOfficialServerUrl } from "@/services/appConfig";
import type { DesktopSyncSettings } from "@/services/vaultRepository";
import { webUrlForApiUrl } from "@/stores/vault/syncConnection";

export function userWebAppUrl(sync: DesktopSyncSettings): string {
  const baseUrl =
    sync.mode === "official"
      ? configuredOfficialServerUrl()
      : webUrlForApiUrl(sync.serverUrl);
  return new URL("/", baseUrl).toString();
}
