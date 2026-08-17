use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

use tauri::{AppHandle, State};

use crate::app_window;

#[cfg(not(target_os = "windows"))]
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
#[cfg(target_os = "windows")]
use windows_sys::Win32::{
    System::Threading::GetCurrentThreadId,
    UI::{
        Input::KeyboardAndMouse::{RegisterHotKey, UnregisterHotKey},
        WindowsAndMessaging::{
            GetMessageW, PeekMessageW, PostThreadMessageW, MSG, PM_NOREMOVE, WM_HOTKEY, WM_QUIT,
        },
    },
};

const SUPPORTED_ACTIONS: [&str; 4] = ["quickSearch", "lock", "showMainWindow", "hideMainWindow"];

#[derive(Default)]
pub struct GlobalShortcutState {
    registered: Mutex<HashMap<String, String>>,
    pending_actions: Arc<Mutex<Vec<String>>>,
    #[cfg(target_os = "windows")]
    worker: Mutex<Option<WindowsShortcutWorker>>,
}

#[derive(Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalShortcutBinding {
    action: String,
    shortcut: String,
}

#[cfg(target_os = "windows")]
struct WindowsShortcutWorker {
    thread_id: u32,
    thread: Option<std::thread::JoinHandle<()>>,
}

#[cfg(target_os = "windows")]
type WindowsShortcutSetup = (WindowsShortcutWorker, HashMap<String, String>, Vec<String>);

#[cfg(target_os = "windows")]
impl WindowsShortcutWorker {
    fn stop(mut self) {
        unsafe {
            PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0);
        }
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[tauri::command]
pub fn replace_global_shortcuts(
    app: AppHandle,
    state: State<'_, GlobalShortcutState>,
    bindings: Vec<GlobalShortcutBinding>,
) -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        replace_windows_shortcuts(app, &state, bindings)
    }

    #[cfg(not(target_os = "windows"))]
    {
        replace_plugin_shortcuts(app, &state, bindings)
    }
}

#[tauri::command]
pub fn stop_global_shortcuts(
    app: AppHandle,
    state: State<'_, GlobalShortcutState>,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        if let Some(worker) = state
            .worker
            .lock()
            .map_err(|_| "global shortcut worker is unavailable".to_string())?
            .take()
        {
            worker.stop();
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let mut registered = lock_registered(state.inner())?;
        for shortcut in registered.values() {
            let _ = app.global_shortcut().unregister(shortcut.as_str());
        }
        registered.clear();
        return Ok(());
    }

    lock_registered(state.inner())?.clear();
    Ok(())
}

#[tauri::command]
pub fn take_pending_global_shortcuts(
    state: State<'_, GlobalShortcutState>,
) -> Result<Vec<String>, String> {
    let mut pending = state
        .pending_actions
        .lock()
        .map_err(|_| "global shortcut queue is unavailable".to_string())?;
    Ok(std::mem::take(&mut *pending))
}

pub fn is_registered(
    app: &AppHandle,
    state: &State<'_, GlobalShortcutState>,
    shortcut: &str,
) -> bool {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        let Ok(target) = crate::parse_windows_hotkey(shortcut) else {
            return false;
        };
        lock_registered(state.inner()).is_ok_and(|registered| {
            registered
                .values()
                .filter_map(|value| crate::parse_windows_hotkey(value).ok())
                .any(|registered_shortcut| registered_shortcut == target)
        })
    }

    #[cfg(not(target_os = "windows"))]
    {
        app.global_shortcut().is_registered(shortcut)
    }
}

fn lock_registered(
    state: &GlobalShortcutState,
) -> Result<std::sync::MutexGuard<'_, HashMap<String, String>>, String> {
    state
        .registered
        .lock()
        .map_err(|_| "global shortcut state is unavailable".to_string())
}

fn handle_action(app: &AppHandle, pending_actions: &Mutex<Vec<String>>, action: &str) {
    match action {
        "quickSearch" => {
            let app = app.clone();
            std::thread::spawn(move || {
                if app_window::show_cached_quick_search_window(&app).is_err() {
                    app_window::show_main_window(&app);
                }
            });
        }
        "showMainWindow" => app_window::show_main_window(app),
        "hideMainWindow" => app_window::hide_main_window(app),
        "lock" => enqueue_action(pending_actions, action),
        _ => {}
    }
}

fn enqueue_action(pending_actions: &Mutex<Vec<String>>, action: &str) {
    if let Ok(mut pending) = pending_actions.lock() {
        pending.push(action.to_string());
    }
}

#[cfg(target_os = "windows")]
fn replace_windows_shortcuts(
    app: AppHandle,
    state: &State<'_, GlobalShortcutState>,
    bindings: Vec<GlobalShortcutBinding>,
) -> Result<Vec<String>, String> {
    let mut worker = state
        .worker
        .lock()
        .map_err(|_| "global shortcut worker is unavailable".to_string())?;
    if let Some(previous) = worker.take() {
        previous.stop();
    }
    if let Ok(mut pending) = state.pending_actions.lock() {
        pending.clear();
    }

    let (next_worker, registered, failed_actions) =
        start_windows_worker(app, state.pending_actions.clone(), bindings)?;
    *worker = Some(next_worker);
    *lock_registered(state.inner())? = registered;
    Ok(failed_actions)
}

#[cfg(target_os = "windows")]
fn start_windows_worker(
    app: AppHandle,
    pending_actions: Arc<Mutex<Vec<String>>>,
    bindings: Vec<GlobalShortcutBinding>,
) -> Result<WindowsShortcutSetup, String> {
    let (setup_sender, setup_receiver) = std::sync::mpsc::sync_channel(1);
    let thread = std::thread::Builder::new()
        .name("lockpass-global-shortcuts".to_string())
        .spawn(move || {
            let thread_id = unsafe { GetCurrentThreadId() };
            let mut message = unsafe { std::mem::zeroed::<MSG>() };
            unsafe {
                PeekMessageW(&mut message, std::ptr::null_mut(), 0, 0, PM_NOREMOVE);
            }

            let mut actions_by_id = HashMap::new();
            let mut registered = HashMap::new();
            let mut failed_actions = Vec::new();

            for (index, binding) in bindings.into_iter().enumerate() {
                if !SUPPORTED_ACTIONS.contains(&binding.action.as_str()) {
                    failed_actions.push(binding.action);
                    continue;
                }
                let Ok((modifiers, key_code)) = crate::parse_windows_hotkey(&binding.shortcut)
                else {
                    failed_actions.push(binding.action);
                    continue;
                };
                let hotkey_id = 0x4c50 + index as i32;
                let registered_ok =
                    unsafe { RegisterHotKey(std::ptr::null_mut(), hotkey_id, modifiers, key_code) }
                        != 0;
                if registered_ok {
                    actions_by_id.insert(hotkey_id, binding.action.clone());
                    registered.insert(binding.action, binding.shortcut);
                } else {
                    failed_actions.push(binding.action);
                }
            }

            let _ = setup_sender.send((thread_id, registered, failed_actions));
            loop {
                let result = unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) };
                if result <= 0 {
                    break;
                }
                if message.message == WM_HOTKEY {
                    if let Some(action) = actions_by_id.get(&(message.wParam as i32)) {
                        handle_action(&app, &pending_actions, action);
                    }
                }
            }

            for hotkey_id in actions_by_id.keys() {
                unsafe {
                    UnregisterHotKey(std::ptr::null_mut(), *hotkey_id);
                }
            }
        })
        .map_err(|error| format!("failed to start global shortcut worker: {error}"))?;

    let (thread_id, registered, failed_actions) = setup_receiver
        .recv()
        .map_err(|error| format!("failed to initialize global shortcuts: {error}"))?;
    Ok((
        WindowsShortcutWorker {
            thread_id,
            thread: Some(thread),
        },
        registered,
        failed_actions,
    ))
}

#[cfg(not(target_os = "windows"))]
fn replace_plugin_shortcuts(
    app: AppHandle,
    state: &State<'_, GlobalShortcutState>,
    bindings: Vec<GlobalShortcutBinding>,
) -> Result<Vec<String>, String> {
    let mut registered = lock_registered(state.inner())?;
    for shortcut in registered.values() {
        let _ = app.global_shortcut().unregister(shortcut.as_str());
    }
    registered.clear();
    if let Ok(mut pending) = state.pending_actions.lock() {
        pending.clear();
    }

    let mut failed_actions = Vec::new();
    for binding in bindings {
        if !SUPPORTED_ACTIONS.contains(&binding.action.as_str()) {
            failed_actions.push(binding.action);
            continue;
        }
        let action = binding.action.clone();
        let action_for_handler = action.clone();
        let pending_actions = state.pending_actions.clone();
        match app.global_shortcut().on_shortcut(
            binding.shortcut.as_str(),
            move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    handle_action(app, &pending_actions, &action_for_handler);
                }
            },
        ) {
            Ok(()) => {
                registered.insert(action, binding.shortcut);
            }
            Err(_) => failed_actions.push(action),
        }
    }
    Ok(failed_actions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn supported_actions_match_frontend_settings() {
        assert_eq!(
            SUPPORTED_ACTIONS,
            ["quickSearch", "lock", "showMainWindow", "hideMainWindow"]
        );
    }
}
