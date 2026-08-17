use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder, Window,
    WindowEvent,
};

const MAIN_WINDOW_LABEL: &str = "main";
const QUICK_SEARCH_WINDOW_LABEL: &str = "quick-search";
const QUICK_SEARCH_UPDATED_EVENT: &str = "lockpass://quick-search-updated";
const TRAY_ID: &str = "lockpass-main";
const OPEN_MENU_ID: &str = "open-lockpass";
const QUIT_MENU_ID: &str = "quit-lockpass";

struct TrayLabels {
    open: &'static str,
    quit: &'static str,
}

#[derive(Default)]
pub struct QuickSearchWindowState {
    payload: Mutex<Option<serde_json::Value>>,
}

impl QuickSearchWindowState {
    fn replace_payload(&self, payload: serde_json::Value) -> Result<(), String> {
        *self
            .payload
            .lock()
            .map_err(|_| "quick search payload is unavailable".to_string())? = Some(payload);
        Ok(())
    }

    fn payload(&self) -> Result<Option<serde_json::Value>, String> {
        self.payload
            .lock()
            .map_err(|_| "quick search payload is unavailable".to_string())
            .map(|payload| payload.clone())
    }

    fn has_payload(&self) -> Result<bool, String> {
        self.payload
            .lock()
            .map_err(|_| "quick search payload is unavailable".to_string())
            .map(|payload| payload.is_some())
    }

    fn clear(&self) -> Result<(), String> {
        *self
            .payload
            .lock()
            .map_err(|_| "quick search payload is unavailable".to_string())? = None;
        Ok(())
    }
}

pub fn setup(app: &App) -> tauri::Result<()> {
    let labels = tray_labels(sys_locale::get_locale().as_deref());
    let open_item = MenuItem::with_id(app, OPEN_MENU_ID, labels.open, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, QUIT_MENU_ID, labels.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &separator, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("LockPass")
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN_MENU_ID => show_main_window(app),
            QUIT_MENU_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.build(app)?;
    Ok(())
}

pub fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    if window.label() == QUICK_SEARCH_WINDOW_LABEL {
        if should_close_quick_search_window(window.label(), event) {
            let _ = window.close();
        }
        return;
    }

    if window.label() != MAIN_WINDOW_LABEL {
        return;
    }

    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
}

fn should_close_quick_search_window(window_label: &str, event: &WindowEvent) -> bool {
    window_label == QUICK_SEARCH_WINDOW_LABEL && matches!(event, WindowEvent::Focused(false))
}

#[tauri::command]
pub async fn show_quick_search_window(
    app: AppHandle,
    state: State<'_, QuickSearchWindowState>,
    payload: serde_json::Value,
) -> Result<(), String> {
    state.replace_payload(payload)?;
    show_cached_quick_search_window(&app)
}

#[tauri::command]
pub fn set_quick_search_payload(
    state: State<'_, QuickSearchWindowState>,
    payload: serde_json::Value,
) -> Result<(), String> {
    state.replace_payload(payload)
}

pub fn show_cached_quick_search_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<QuickSearchWindowState>();
    if !state.has_payload()? {
        return Err("quick search is unavailable while the vault is locked".to_string());
    }

    if let Some(window) = app.get_webview_window(QUICK_SEARCH_WINDOW_LABEL) {
        window
            .show()
            .map_err(|error| format!("failed to show quick search window: {error}"))?;
        let _ = window.unminimize();
        let _ = window.center();
        window
            .set_focus()
            .map_err(|error| format!("failed to focus quick search window: {error}"))?;
        window
            .emit(QUICK_SEARCH_UPDATED_EVENT, ())
            .map_err(|error| format!("failed to refresh quick search window: {error}"))?;
        return Ok(());
    }

    let build_result = WebviewWindowBuilder::new(
        app,
        QUICK_SEARCH_WINDOW_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("LockPass")
    .inner_size(700.0, 560.0)
    .min_inner_size(560.0, 420.0)
    .resizable(true)
    .always_on_top(true)
    .center()
    .build();

    match build_result {
        Ok(window) => window
            .set_focus()
            .map_err(|error| format!("failed to focus quick search window: {error}")),
        Err(error) => {
            let _ = state.clear();
            Err(format!("failed to create quick search window: {error}"))
        }
    }
}

#[tauri::command]
pub fn quick_search_payload(
    state: State<'_, QuickSearchWindowState>,
) -> Result<Option<serde_json::Value>, String> {
    state.payload()
}

#[tauri::command]
pub fn close_quick_search_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(QUICK_SEARCH_WINDOW_LABEL) {
        window
            .close()
            .map_err(|error| format!("failed to close quick search window: {error}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_quick_search_payload(
    app: AppHandle,
    state: State<'_, QuickSearchWindowState>,
) -> Result<(), String> {
    state.clear()?;
    if let Some(window) = app.get_webview_window(QUICK_SEARCH_WINDOW_LABEL) {
        window
            .close()
            .map_err(|error| format!("failed to close quick search window: {error}"))?;
    }
    Ok(())
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        let _ = try_show_main_window(&app);
    });
}

pub fn hide_main_window<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = window.hide();
        }
    });
}

#[tauri::command]
pub fn show_desktop_window(app: AppHandle) -> Result<(), String> {
    show_main_window(&app);
    Ok(())
}

#[tauri::command]
pub fn hide_desktop_window(app: AppHandle) -> Result<(), String> {
    hide_main_window(&app);
    Ok(())
}

fn try_show_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window
            .show()
            .map_err(|error| format!("failed to show main window: {error}"))?;
        window
            .unminimize()
            .map_err(|error| format!("failed to restore main window: {error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("failed to focus main window: {error}"))?;
        return Ok(());
    }

    Err("main window is unavailable".to_string())
}

fn tray_labels(locale: Option<&str>) -> TrayLabels {
    if locale.is_some_and(|locale| locale.to_ascii_lowercase().starts_with("zh")) {
        TrayLabels {
            open: "打开 LockPass",
            quit: "退出程序",
        }
    } else {
        TrayLabels {
            open: "Open LockPass",
            quit: "Quit LockPass",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quick_search_payload_can_be_replaced_and_cleared() {
        let state = QuickSearchWindowState::default();
        let payload = serde_json::json!({ "query": "github" });

        state.replace_payload(payload.clone()).unwrap();
        assert_eq!(state.payload().unwrap(), Some(payload));

        state.clear().unwrap();
        assert_eq!(state.payload().unwrap(), None);
    }

    #[test]
    fn quick_search_window_closes_when_it_loses_focus() {
        assert!(should_close_quick_search_window(
            QUICK_SEARCH_WINDOW_LABEL,
            &WindowEvent::Focused(false),
        ));
        assert!(!should_close_quick_search_window(
            QUICK_SEARCH_WINDOW_LABEL,
            &WindowEvent::Focused(true),
        ));
        assert!(!should_close_quick_search_window(
            MAIN_WINDOW_LABEL,
            &WindowEvent::Focused(false),
        ));
    }

    #[test]
    fn tray_labels_follow_chinese_system_locale() {
        let labels = tray_labels(Some("zh-CN"));

        assert_eq!(labels.open, "打开 LockPass");
        assert_eq!(labels.quit, "退出程序");
    }

    #[test]
    fn tray_labels_fall_back_to_english() {
        let labels = tray_labels(Some("fr-FR"));

        assert_eq!(labels.open, "Open LockPass");
        assert_eq!(labels.quit, "Quit LockPass");
    }
}
