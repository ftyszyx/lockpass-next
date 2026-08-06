import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const service = read("./webApp.ts");
const repository = read("./vaultRepository.ts");
const header = read("../pages/desktop/components/DesktopHeader.vue");
const page = read("../pages/desktop/DesktopVaultPage.vue");

assert.match(
  service,
  /sync\.mode === "official"[\s\S]*configuredOfficialServerUrl\(\)[\s\S]*webUrlForApiUrl\(sync\.serverUrl\)/,
  "the web entry should use the official or self-hosted web app URL",
);
assert.match(
  header,
  /v-if="!webRuntime"[\s\S]*emit\('openWebApp'\)/,
  "the desktop header should expose the web entry only outside the web runtime",
);
assert.match(
  page,
  /openExternalUrl\(userWebAppUrl\(vaultStore\.settings\.sync\)\)[\s\S]*@open-web-app="openUserWebApp"/,
  "the web entry should open through the external-browser service",
);
assert.match(
  repository,
  /window\.open\('', '_blank'\)[\s\S]*opened\.opener = null[\s\S]*opened\.location\.href = url/,
  "browser preview should open the web app once without retaining an opener",
);

console.log("web app entry tests passed");
