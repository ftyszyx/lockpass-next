import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const service = read("./systemSession.ts");
const page = read("../pages/desktop/DesktopVaultPage.vue");
const managementPage = read(
  "../pages/desktop/components/ManagementPage.vue",
);
const rustBackend = read("../../src-tauri/src/lib.rs");

assert.match(
  service,
  /lockpassnew:\/\/system-session-locked/,
  "the frontend listener should subscribe to the native session-lock event",
);
assert.match(
  rustBackend,
  /const SYSTEM_SESSION_LOCKED_EVENT: &str =\s*"lockpassnew:\/\/system-session-locked";/,
  "the native listener should emit the event used by the frontend",
);
assert.match(
  rustBackend,
  /message == WM_WTSSESSION_CHANGE[\s\S]*wparam == WTS_SESSION_LOCK as usize/,
  "the Windows listener should emit only for a locked system session",
);
assert.match(
  page,
  /startSystemSessionLockListener\([\s\S]*handleSystemSessionLock[\s\S]*settings\.security\.lockOnSystemLock[\s\S]*lockApp\(\)/,
  "the desktop page should honor the setting before locking the vault",
);
assert.match(
  managementPage,
  /function changeLockOnSystemLock[\s\S]*lockOnSystemLock:[\s\S]*@change="changeLockOnSystemLock"/,
  "the security settings page should persist the system-lock option",
);

console.log("system session lock tests passed");
