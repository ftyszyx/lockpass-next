import assert from "node:assert/strict";
import { SyncApiError } from "@/services/syncClient";
import {
  isSyncConnectionInvalid,
  parseSyncDeviceBindCallback,
  syncErrorLogMetadata,
  syncServerUrlForSettings,
  webUrlForApiUrl,
} from "./syncConnection";

const callbackPayload = {
  mode: "selfhost" as const,
  serverUrl: "http://127.0.0.1:1480/",
  account: {
    id: "account-one",
    displayName: "alice",
    email: "alice@example.com",
  },
  device: {
    id: "device-one",
    name: "Windows",
  },
  deviceToken: "device-token",
  tokenType: "Bearer",
};
const encodedPayload = Buffer.from(JSON.stringify(callbackPayload)).toString("base64url");
const parsed = parseSyncDeviceBindCallback(
  `lockpassnew://auth/callback?payload=${encodedPayload}`,
);

assert.equal(parsed.serverUrl, "http://127.0.0.1:1480");
assert.equal(parsed.account.id, "account-one");
assert.equal(parsed.device.id, "device-one");

assert.throws(
  () => parseSyncDeviceBindCallback("lockpassnew://auth/callback"),
  /syncOfficialAuthorizationMissing/,
);
assert.throws(
  () => parseSyncDeviceBindCallback(`https://example.com/callback?payload=${encodedPayload}`),
  /syncOfficialCallbackMismatch/,
);

assert.equal(webUrlForApiUrl("http://127.0.0.1:1480"), "http://127.0.0.1:1431/");
assert.equal(webUrlForApiUrl("https://sync.example.com/api"), "https://sync.example.com/api");
assert.equal(
  syncServerUrlForSettings({
    mode: "selfhost",
    serverUrl: "sync.example.com",
    syncSpaceId: null,
    accountId: null,
    accountLabel: null,
    deviceId: null,
    cursor: 0,
    connectedAt: null,
    lastSyncAt: null,
  }),
  "https://sync.example.com",
);

assert.equal(isSyncConnectionInvalid(new SyncApiError("Forbidden", 403)), true);
assert.equal(isSyncConnectionInvalid(new Error("temporary network failure")), false);
assert.deepEqual(syncErrorLogMetadata(new SyncApiError("Forbidden", 403)), {
  name: "Error",
  message: "Forbidden",
  status: 403,
});

console.log("vault sync connection tests passed");
