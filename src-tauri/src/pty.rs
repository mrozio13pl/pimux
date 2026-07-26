use crate::custom_sources::custom_source_executable;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
};
use tauri::{ipc::Channel, path::BaseDirectory, Manager, WebviewWindow};

#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum ProcessEvent {
    Started { title: String },
    Idle,
    Exited,
}

pub(crate) struct Session {
    owner: String,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
}

pub(crate) struct PtyState {
    pub(crate) sessions: Arc<Mutex<HashMap<u64, Arc<Session>>>>,
    next_id: AtomicU64,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            next_id: AtomicU64::new(0),
        }
    }
}

fn source_command(
    source_id: &str,
    pi_extension: Option<&Path>,
    session_id: Option<&str>,
    resume_session: bool,
    session_exists: bool,
) -> Result<CommandBuilder, String> {
    match source_id {
        "builtin:shell" => Ok(CommandBuilder::new_default_prog()),
        "builtin:pi" => {
            let extension = pi_extension.ok_or("Pi extension resource is missing")?;
            let mut command = CommandBuilder::new("pi");
            command.arg("-e");
            command.arg(extension);
            if let Some(session_id) = session_id {
                if session_id.is_empty()
                    || session_id.len() > 64
                    || !session_id.starts_with(|character: char| character.is_ascii_alphanumeric())
                    || !session_id
                        .chars()
                        .all(|character| character.is_ascii_alphanumeric() || character == '-')
                {
                    return Err("invalid Pi session ID".into());
                }
                if session_exists {
                    command.arg("--session");
                    command.arg(session_id);
                } else if resume_session {
                    command.arg("--resume");
                }
            } else if resume_session {
                command.arg("--resume");
            }
            Ok(command)
        }
        _ => Err(format!("unknown view source: {source_id}")),
    }
}

fn pi_session_exists(root: &Path, session_id: &str) -> bool {
    let suffix = format!("_{session_id}.jsonl");
    std::fs::read_dir(root)
        .into_iter()
        .flatten()
        .flatten()
        .any(|directory| {
            std::fs::read_dir(directory.path())
                .into_iter()
                .flatten()
                .flatten()
                .any(|entry| entry.file_name().to_string_lossy().ends_with(&suffix))
        })
}

#[cfg(unix)]
fn foreground_process(root_pid: u32, process_group: Option<i32>) -> Option<i32> {
    process_group.filter(|pid| *pid != root_pid as i32)
}

#[cfg(target_os = "linux")]
fn process_title(pid: i32) -> String {
    std::fs::read_to_string(format!("/proc/{pid}/comm"))
        .ok()
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| format!("Process {pid}"))
}

#[cfg(all(unix, not(target_os = "linux")))]
fn process_title(pid: i32) -> String {
    format!("Process {pid}")
}

fn validate_size(rows: u16, cols: u16) -> Result<PtySize, String> {
    if !(1..=500).contains(&rows) || !(1..=1000).contains(&cols) {
        return Err("invalid terminal size".into());
    }

    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}

fn close_session(sessions: &Arc<Mutex<HashMap<u64, Arc<Session>>>>, id: u64) {
    let session = sessions
        .lock()
        .ok()
        .and_then(|mut sessions| sessions.remove(&id));
    if let Some(session) = session {
        std::thread::spawn(move || {
            if let Ok(mut child) = session.child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        });
    }
}

pub(crate) fn close_window_sessions(
    sessions: &Arc<Mutex<HashMap<u64, Arc<Session>>>>,
    owner: &str,
) {
    let ids = sessions
        .lock()
        .map(|sessions| {
            sessions
                .iter()
                .filter_map(|(id, session)| (session.owner == owner).then_some(*id))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    for id in ids {
        close_session(sessions, id);
    }
}

fn owned_session(
    sessions: &Arc<Mutex<HashMap<u64, Arc<Session>>>>,
    id: u64,
    owner: &str,
) -> Result<Arc<Session>, String> {
    let session = sessions
        .lock()
        .map_err(|_| "PTY state unavailable")?
        .get(&id)
        .cloned()
        .ok_or("PTY session not found")?;
    if session.owner != owner {
        return Err("PTY session belongs to another window".into());
    }
    Ok(session)
}

#[tauri::command]
pub(crate) fn pty_spawn(
    rows: u16,
    cols: u16,
    cwd: String,
    source_id: String,
    session_id: Option<String>,
    resume_session: bool,
    on_data: Channel<Vec<u8>>,
    on_process: Channel<ProcessEvent>,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<u64, String> {
    let size = validate_size(rows, cols)?;
    let cwd = std::path::PathBuf::from(cwd)
        .canonicalize()
        .map_err(|error| format!("invalid working directory: {error}"))?;
    if !cwd.is_dir() {
        return Err("working directory is not a directory".into());
    }
    let pi_extension = if source_id == "builtin:pi" {
        Some(
            window
                .path()
                .resolve("resources/pi-extension.ts", BaseDirectory::Resource)
                .map_err(|error| format!("failed to resolve Pi extension resource: {error}"))?,
        )
    } else {
        None
    };
    let session_exists = session_id.as_deref().is_some_and(|session_id| {
        let sessions_dir = std::env::var_os("PI_CODING_AGENT_SESSION_DIR")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("PI_CODING_AGENT_DIR")
                    .map(PathBuf::from)
                    .or_else(|| {
                        window
                            .path()
                            .home_dir()
                            .ok()
                            .map(|home| home.join(".pi/agent"))
                    })
                    .map(|directory| directory.join("sessions"))
            });
        sessions_dir.is_some_and(|directory| pi_session_exists(&directory, session_id))
    });
    let mut command = if source_id.starts_with("custom:") {
        CommandBuilder::new(custom_source_executable(window.app_handle(), &source_id)?)
    } else {
        source_command(
            &source_id,
            pi_extension.as_deref(),
            session_id.as_deref(),
            resume_session,
            session_exists,
        )?
    };
    command.env("TERM", "xterm-256color");
    command.cwd(cwd);
    let pair = native_pty_system()
        .openpty(size)
        .map_err(|error| error.to_string())?;

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    #[cfg(unix)]
    let root_pid = child.process_id();
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;
    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let sessions = Arc::clone(&state.sessions);
    let session = Arc::new(Session {
        owner: window.label().to_string(),
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Mutex::new(child),
    });

    sessions
        .lock()
        .map_err(|_| "PTY state unavailable".to_string())?
        .insert(id, Arc::clone(&session));

    #[cfg(unix)]
    if source_id == "builtin:shell" {
        if let Some(root_pid) = root_pid {
            let watched_sessions = Arc::clone(&sessions);
            let watched_session = Arc::clone(&session);
            let process_events = on_process.clone();
            std::thread::spawn(move || {
                let mut foreground = None;
                loop {
                    if !watched_sessions
                        .lock()
                        .map(|sessions| sessions.contains_key(&id))
                        .unwrap_or(false)
                    {
                        break;
                    }
                    let process = watched_session.master.lock().ok().and_then(|master| {
                        foreground_process(root_pid, master.process_group_leader())
                    });
                    if process != foreground {
                        let event = match process {
                            Some(pid) => ProcessEvent::Started {
                                title: process_title(pid),
                            },
                            None if foreground.is_some() => ProcessEvent::Idle,
                            None => {
                                foreground = process;
                                std::thread::sleep(std::time::Duration::from_millis(75));
                                continue;
                            }
                        };
                        if process_events.send(event).is_err() {
                            break;
                        }
                        foreground = process;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(75));
                }
            });
        }
    }

    std::thread::spawn(move || {
        let mut buffer = [0_u8; 16 * 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) | Err(_) => break,
                Ok(length) if on_data.send(buffer[..length].to_vec()).is_err() => break,
                Ok(_) => {}
            }
        }
        let _ = on_process.send(ProcessEvent::Exited);
        close_session(&sessions, id);
    });

    Ok(id)
}

#[tauri::command]
pub(crate) fn pty_write(
    id: u64,
    data: Vec<u8>,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    if data.len() > 64 * 1024 {
        return Err("terminal input too large".into());
    }

    let session = owned_session(&state.sessions, id, window.label())?;
    let mut writer = session
        .writer
        .lock()
        .map_err(|_| "PTY writer unavailable")?;
    writer.write_all(&data).map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn pty_resize(
    id: u64,
    rows: u16,
    cols: u16,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let size = validate_size(rows, cols)?;
    let session = owned_session(&state.sessions, id, window.label())?;
    let result = session
        .master
        .lock()
        .map_err(|_| "PTY master unavailable")?
        .resize(size)
        .map_err(|error| error.to_string());
    result
}

#[tauri::command]
pub(crate) fn pty_close(
    id: u64,
    window: WebviewWindow,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    owned_session(&state.sessions, id, window.label())?;
    close_session(&state.sessions, id);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{foreground_process, pi_session_exists, source_command, validate_size};
    #[cfg(unix)]
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::path::Path;
    #[cfg(unix)]
    use std::{
        io::Write,
        time::{Duration, Instant},
    };

    #[test]
    fn terminal_size_is_bounded() {
        assert!(validate_size(24, 80).is_ok());
        assert!(validate_size(0, 80).is_err());
        assert!(validate_size(24, 1001).is_err());
    }

    #[test]
    fn sources_are_allowlisted() {
        assert!(source_command("builtin:shell", None, None, false, false)
            .unwrap()
            .is_default_prog());
        let fresh = source_command(
            "builtin:pi",
            Some(Path::new("pi-extension.ts")),
            None,
            false,
            false,
        )
        .unwrap();
        assert_eq!(fresh.get_argv().len(), 3);
        let resumed = source_command(
            "builtin:pi",
            Some(Path::new("pi-extension.ts")),
            None,
            true,
            false,
        )
        .unwrap();
        assert_eq!(resumed.get_argv()[3], "--resume");
        let stale = source_command(
            "builtin:pi",
            Some(Path::new("pi-extension.ts")),
            Some("12345678-abcd"),
            true,
            false,
        )
        .unwrap();
        assert_eq!(stale.get_argv()[3], "--resume");
        let pi = source_command(
            "builtin:pi",
            Some(Path::new("pi-extension.ts")),
            Some("12345678-abcd"),
            true,
            true,
        )
        .unwrap();
        assert_eq!(pi.get_argv()[3], "--session");
        assert_eq!(pi.get_argv()[4], "12345678-abcd");
        assert!(source_command(
            "builtin:pi",
            Some(Path::new("extension.ts")),
            Some("--bad"),
            false,
            false,
        )
        .is_err());
        assert!(source_command("custom:unknown", None, None, false, false).is_err());
    }

    #[test]
    fn pi_session_lookup_uses_filename_id() {
        let root = std::env::temp_dir().join(format!("pimux-session-test-{}", std::process::id()));
        let project = root.join("project");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(project.join("timestamp_12345678-abcd.jsonl"), "").unwrap();
        assert!(pi_session_exists(&root, "12345678-abcd"));
        assert!(!pi_session_exists(&root, "missing"));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn shell_is_idle_only_when_it_owns_the_foreground() {
        assert_eq!(foreground_process(10, Some(10)), None);
        assert_eq!(foreground_process(10, Some(11)), Some(11));
    }

    #[cfg(unix)]
    #[test]
    fn foreground_child_returns_control_to_shell() {
        let pair = native_pty_system().openpty(PtySize::default()).unwrap();
        let mut child = pair.slave.spawn_command(CommandBuilder::new("sh")).unwrap();
        let root_pid = child.process_id().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        writer.write_all(b"sleep 0.25\n").unwrap();
        writer.flush().unwrap();

        let deadline = Instant::now() + Duration::from_secs(2);
        while foreground_process(root_pid, pair.master.process_group_leader()).is_none()
            && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert!(foreground_process(root_pid, pair.master.process_group_leader()).is_some());

        while foreground_process(root_pid, pair.master.process_group_leader()).is_some()
            && Instant::now() < deadline
        {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(
            foreground_process(root_pid, pair.master.process_group_leader()),
            None
        );

        writer.write_all(b"exit\n").unwrap();
        writer.flush().unwrap();
        child.wait().unwrap();
    }
}
