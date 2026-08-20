import assert from "node:assert/strict";
import type { VaultItemField } from "@lockpass/core";
import {
  DEFAULT_SYNC_SETTINGS,
  backupSyncSettings,
  buildSubtitle,
  normalizeLayout,
  normalizeLoggingSettings,
  normalizeSecuritySettings,
  normalizeSyncSettings,
  normalizeTheme,
  requireSelfHostServerUrl,
} from "./model";

const usernameField: VaultItemField = {
  id: "field-username",
  kind: "username",
  label: "username",
  value: "alice@example.com",
  sensitive: false,
};
const urlField: VaultItemField = {
  id: "field-url",
  kind: "url",
  label: "website",
  value: "example.com",
  sensitive: false,
};

assert.deepEqual(normalizeLayout({ sidebarWidth: 999, itemListWidth: 1 }), {
  sidebarWidth: 360,
  itemListWidth: 260,
});

assert.deepEqual(normalizeLoggingSettings({ level: "debug" }), {
  level: "debug",
});
assert.deepEqual(normalizeLoggingSettings({ level: "verbose" as never }), {
  level: "error",
});
assert.equal(normalizeTheme(undefined), "system");
assert.equal(normalizeTheme("light"), "light");
assert.equal(normalizeTheme("dark"), "dark");
assert.equal(normalizeTheme("sepia"), "system");

assert.deepEqual(
  normalizeSecuritySettings({ autoLockDelaySeconds: 4.4, startOnLogin: true }),
  {
    startOnLogin: true,
    lockOnSystemLock: true,
    autoLockOnLimit: true,
    autoLockDelaySeconds: 4,
  },
);
assert.equal(
  normalizeSecuritySettings({ lockOnSystemLock: false }).lockOnSystemLock,
  false,
);

const selfhostSync = normalizeSyncSettings({
  mode: "selfhost",
  serverUrl: "http://127.0.0.1:1480",
});
assert.equal(selfhostSync.serverUrl, "http://127.0.0.1:1480");

const connectedSelfhostSync = normalizeSyncSettings({
  mode: "selfhost",
  serverUrl: "http://127.0.0.1:1480",
  accountId: "account-one",
});
assert.equal(connectedSelfhostSync.serverUrl, "http://127.0.0.1:1480");

const storedOfficialSync = normalizeSyncSettings({
  mode: "official",
  serverUrl: "https://old-api.example.com",
});
assert.equal(storedOfficialSync.serverUrl, "https://old-api.example.com");

const backupSync = backupSyncSettings({
  mode: "selfhost",
  serverUrl: "https://vault.example.com",
  accountId: "account-one",
  accountLabel: "person@example.com",
  deviceId: "device-one",
  syncSpaceId: "space-one",
  cursor: 42,
});
assert.equal(backupSync.serverUrl, "https://vault.example.com");
assert.equal(backupSync.accountId, null);
assert.equal(backupSync.deviceId, null);
assert.equal(backupSync.syncSpaceId, null);
assert.equal(backupSync.cursor, 0);

assert.equal(
  buildSubtitle("login", [usernameField, urlField], [], "", "en-US"),
  "alice@example.com / example.com",
);
assert.equal(
  buildSubtitle("secure-note", [], [], "hello note", "en-US"),
  "hello note",
);

assert.throws(() => requireSelfHostServerUrl(""), /syncServerRequired/);
assert.equal(DEFAULT_SYNC_SETTINGS.cursor, 0);

console.log("vault model tests passed");
