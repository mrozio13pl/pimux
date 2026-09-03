#[cfg(unix)]
#[path = "client.rs"]
mod backend;
#[cfg(windows)]
#[path = "local.rs"]
mod backend;

use crate::session::{validate_size, ProcessEvent, SessionInfo, SpawnSpec};
use std::path::PathBuf;
use tauri::{ipc::Channel, path::BaseDirectory, Manager, WebviewWindow};

pub(crate) use backend::PtyState;

fn app_data_dir(window: &WebviewWindow) -> Result<PathBuf, String> {
    window
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())
}

fn resource(window: &WebviewWindow, name: &str) -> Result<PathBuf, String> {
    window
        .path()
        .resolve(name, BaseDirectory::Resource)
        .map_err(|error| format!("failed to resolve resource: {error}"))
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub(crate) fn pty_spawn(
    view_id: String,
    rows: u16,
    cols: u16,
    cwd: String,
    source_id: String,
    executable: Option<String>,
    session_id: Option<String>,
    resume_session: bool,
    on_data: Channel<Vec<u8>>,
    on_process: Channel<ProcessEvent>,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    validate_size(rows, cols)?;
    let spec = SpawnSpec {
        pi_extension: (source_id == "builtin:pi")
            .then(|| resource(&window, "resources/pi-extension.ts"))
            .transpose()?,
        claude_settings: (source_id == "builtin:claudecode")
            .then(|| resource(&window, "resources/claude-settings.json"))
            .transpose()?,
        cwd,
        source_id,
        executable,
        session_id,
        resume_session,
    };

    state.spawn(
        window.label(),
        view_id,
        &spec,
        rows,
        cols,
        &app_data_dir(&window)?,
        window.path().home_dir().ok(),
        on_data,
        on_process,
    )
}

#[tauri::command]
pub(crate) fn pty_write(
    view_id: String,
    data: Vec<u8>,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    if data.len() > 64 * 1024 {
        return Err("terminal input too large".into());
    }
    state.write(window.label(), &view_id, &data)
}

#[tauri::command]
pub(crate) fn pty_resize(
    view_id: String,
    rows: u16,
    cols: u16,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    validate_size(rows, cols)?;
    state.resize(window.label(), &view_id, rows, cols)
}

#[tauri::command]
pub(crate) fn pty_detach(
    view_id: String,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    state.detach(window.label(), &view_id);
    Ok(())
}

#[tauri::command]
pub(crate) fn pty_kill(
    view_id: String,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    state.kill(window.label(), &view_id, &app_data_dir(&window)?);
    Ok(())
}

#[tauri::command]
pub(crate) fn pty_sessions_list(
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<Vec<SessionInfo>, String> {
    state.list(&app_data_dir(&window)?)
}

pub(crate) fn close_window_sessions(state: &PtyState, owner: &str) {
    state.close_window(owner);
}
