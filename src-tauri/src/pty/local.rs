use crate::session::{
    build_command, canonical_cwd, create_claude_event_file, validate_size, ProcessEvent,
    SessionInfo, SpawnSpec,
};
use portable_pty::{native_pty_system, Child, MasterPty};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::ipc::Channel;

struct Session {
    owner: String,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

#[derive(Default)]
pub(crate) struct PtyState {
    sessions: Arc<Mutex<HashMap<String, Arc<Session>>>>,
}

fn close(sessions: &Arc<Mutex<HashMap<String, Arc<Session>>>>, view_id: &str) {
    let session = sessions
        .lock()
        .ok()
        .and_then(|mut sessions| sessions.remove(view_id));
    if let Some(session) = session {
        std::thread::spawn(move || {
            if let Ok(mut child) = session.child.lock() {
                let _ = child.kill();
                let _ = child.wait();
            }
        });
    }
}

impl PtyState {
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn spawn(
        &self,
        owner: &str,
        view_id: String,
        spec: &SpawnSpec,
        rows: u16,
        cols: u16,
        data_dir: &Path,
        home: Option<PathBuf>,
        on_data: Channel<Vec<u8>>,
        on_process: Channel<ProcessEvent>,
    ) -> Result<(), String> {
        let size = validate_size(rows, cols)?;
        let cwd = canonical_cwd(&spec.cwd)?;
        let mut command = build_command(spec, data_dir, home)?;

        let claude_events = (spec.source_id == "builtin:claudecode").then(|| {
            let nonce = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            std::env::temp_dir().join(format!(
                "pimux-claude-{}-{nonce}.jsonl",
                std::process::id()
            ))
        });

        command.env("TERM", "xterm-256color");
        if let Some(path) = &claude_events {
            command.env("PIMUX_CLAUDE_EVENTS", path);
            command.env(
                "PIMUX_EXECUTABLE",
                std::env::current_exe().map_err(|error| error.to_string())?,
            );
        }
        command.cwd(cwd);

        let pair = native_pty_system()
            .openpty(size)
            .map_err(|error| error.to_string())?;
        if let Some(path) = &claude_events {
            create_claude_event_file(path).map_err(|error| error.to_string())?;
        }

        let child = pair.slave.spawn_command(command).map_err(|error| {
            if let Some(path) = &claude_events {
                let _ = std::fs::remove_file(path);
            }
            error.to_string()
        })?;
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| error.to_string())?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| error.to_string())?;
        let sessions = Arc::clone(&self.sessions);
        let session = Arc::new(Session {
            owner: owner.to_string(),
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
        });

        sessions
            .lock()
            .map_err(|_| "PTY state unavailable".to_string())?
            .insert(view_id.clone(), session);

        let (claude_done, claude_drained) = if let Some(path) = claude_events {
            let process_events = on_process.clone();
            let (done_sender, done_receiver) = std::sync::mpsc::channel();
            let (drained_sender, drained_receiver) = std::sync::mpsc::channel();
            std::thread::spawn(move || {
                if let Ok(file) = std::fs::File::open(&path) {
                    let mut reader = BufReader::new(file);
                    loop {
                        let mut line = String::new();
                        match reader.read_line(&mut line) {
                            Ok(0) => match done_receiver.try_recv() {
                                Ok(()) | Err(std::sync::mpsc::TryRecvError::Disconnected) => break,
                                Err(std::sync::mpsc::TryRecvError::Empty) => {
                                    std::thread::sleep(std::time::Duration::from_millis(50));
                                }
                            },
                            Ok(_) => {
                                if let Ok(update) = serde_json::from_str(&line) {
                                    if process_events
                                        .send(ProcessEvent::Update { update })
                                        .is_err()
                                    {
                                        break;
                                    }
                                }
                            }
                            Err(_) => break,
                        }
                    }
                }
                let _ = std::fs::remove_file(path);
                let _ = drained_sender.send(());
            });
            (Some(done_sender), Some(drained_receiver))
        } else {
            (None, None)
        };

        std::thread::spawn(move || {
            let mut buffer = [0_u8; 16 * 1024];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(length) if on_data.send(buffer[..length].to_vec()).is_err() => break,
                    Ok(_) => {}
                }
            }
            if let Some(done) = claude_done {
                let _ = done.send(());
            }
            if let Some(drained) = claude_drained {
                let _ = drained.recv_timeout(std::time::Duration::from_secs(1));
            }
            let _ = on_process.send(ProcessEvent::Exited);
            close(&sessions, &view_id);
        });

        Ok(())
    }

    pub(crate) fn write(&self, owner: &str, view_id: &str, data: &[u8]) -> Result<(), String> {
        let session = self.owned(owner, view_id)?;
        let mut writer = session.writer.lock().map_err(|_| "PTY writer unavailable")?;
        writer.write_all(data).map_err(|error| error.to_string())?;
        writer.flush().map_err(|error| error.to_string())
    }

    pub(crate) fn resize(
        &self,
        owner: &str,
        view_id: &str,
        rows: u16,
        cols: u16,
    ) -> Result<(), String> {
        let size = validate_size(rows, cols)?;
        self.owned(owner, view_id)?
            .master
            .lock()
            .map_err(|_| "PTY master unavailable")?
            .resize(size)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn detach(&self, owner: &str, view_id: &str) {
        self.kill(owner, view_id, Path::new(""));
    }

    pub(crate) fn kill(&self, owner: &str, view_id: &str, _data_dir: &Path) {
        if self.owned(owner, view_id).is_ok() {
            close(&self.sessions, view_id);
        }
    }

    pub(crate) fn list(&self, _data_dir: &Path) -> Result<Vec<SessionInfo>, String> {
        Ok(Vec::new())
    }

    pub(crate) fn close_window(&self, owner: &str) {
        let owned = self
            .sessions
            .lock()
            .map(|sessions| {
                sessions
                    .iter()
                    .filter(|(_, session)| session.owner == owner)
                    .map(|(view_id, _)| view_id.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for view_id in owned {
            close(&self.sessions, &view_id);
        }
    }

    fn owned(&self, owner: &str, view_id: &str) -> Result<Arc<Session>, String> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| "PTY state unavailable")?
            .get(view_id)
            .cloned()
            .ok_or("PTY session not found")?;
        if session.owner != owner {
            return Err("PTY session belongs to another window".into());
        }
        Ok(session)
    }
}
