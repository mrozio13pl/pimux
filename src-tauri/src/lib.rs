mod custom_sources;
mod pty;
mod views;
mod workspace;

use custom_sources::{
    custom_source_add, custom_source_remove, custom_source_update, custom_sources_load,
    lobehub_icon_stage, lobehub_icons_load,
};
use pty::{close_window_sessions, pty_close, pty_resize, pty_spawn, pty_write, PtyState};
use tauri::Manager;
use views::{views_load, views_save};
use workspace::{directory_children, workspace_info};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            #[cfg(target_os = "linux")]
            if let Some(window) = app.get_webview_window("main") {
                window.set_decorations(false)?;
            }
            Ok(())
        })
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_close,
            views_load,
            views_save,
            workspace_info,
            directory_children,
            custom_sources_load,
            custom_source_add,
            custom_source_update,
            custom_source_remove,
            lobehub_icons_load,
            lobehub_icon_stage
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let state = window.state::<PtyState>();
                close_window_sessions(&state.sessions, window.label());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
