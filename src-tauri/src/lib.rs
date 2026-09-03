mod claude;
mod custom_sources;
#[cfg(unix)]
mod daemon;
#[cfg(unix)]
mod protocol;
mod pty;
mod search;
mod session;
mod views;
mod workspace;

use custom_sources::{
    custom_source_add, custom_source_remove, custom_source_update, custom_sources_load,
    lobehub_icon_stage, lobehub_icons_load,
};
use pty::{
    close_window_sessions, pty_detach, pty_kill, pty_resize, pty_sessions_list, pty_spawn,
    pty_write, PtyState,
};
use search::{sessions_refresh, sessions_search, SearchState};
use tauri::Manager;
use views::{views_load, views_save};
use workspace::{directory_children, workspace_info};

pub fn run_claude_hook() -> Result<(), String> {
    claude::run_hook()
}

#[cfg(unix)]
pub fn run_daemon() -> ! {
    daemon::run()
}

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
            app.manage(SearchState::new(app.handle())?);
            Ok(())
        })
        .manage(PtyState::default())
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_detach,
            pty_kill,
            pty_sessions_list,
            sessions_refresh,
            sessions_search,
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
                close_window_sessions(&state, window.label());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
