import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/services/runtime";

export const SYSTEM_SESSION_LOCKED_EVENT =
  "lockpassnew://system-session-locked";

export type SystemSessionLockHandler = () => void | Promise<void>;

export async function startSystemSessionLockListener(
  handler: SystemSessionLockHandler,
): Promise<() => void> {
  if (!isTauriRuntime()) return () => undefined;

  let unlisten: UnlistenFn;
  try {
    unlisten = await listen(SYSTEM_SESSION_LOCKED_EVENT, () => {
      void Promise.resolve(handler()).catch(() => undefined);
    });
  } catch {
    return () => undefined;
  }

  return () => unlisten();
}
