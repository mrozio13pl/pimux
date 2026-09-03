use crate::daemon::{connect, connect_or_spawn};
use crate::protocol::{
    ClientFrame, DaemonFrame, DetachReason, Hello, Open, Resize, ViewId, PROTOCOL_VERSION,
};
use crate::session::{ProcessEvent, SessionInfo, SpawnSpec};
use std::{
    collections::HashMap,
    io::BufReader,
    os::unix::net::UnixStream,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::ipc::Channel;

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(10);

struct Attached {
    owner: String,
    stream: Arc<Mutex<UnixStream>>,
    closing: Arc<AtomicBool>,
}

#[derive(Default)]
pub(crate) struct PtyState {
    sessions: Mutex<HashMap<String, Attached>>,
}

fn handshake(stream: &mut UnixStream, data_dir: &Path) -> Result<(), String> {
    stream
        .set_read_timeout(Some(HANDSHAKE_TIMEOUT))
        .map_err(|error| error.to_string())?;
    ClientFrame::Hello(Hello {
        protocol: PROTOCOL_VERSION,
        app_data_dir: data_dir.to_path_buf(),
    })
    .write(stream)
    .map_err(|error| error.to_string())?;

    match DaemonFrame::read(stream).map_err(|error| error.to_string())? {
        DaemonFrame::HelloOk { .. } => Ok(()),
        DaemonFrame::VersionMismatch { version } => Err(format!(
            "an older session daemon (protocol {version}) holds sessions that cannot be adopted; quit it to continue"
        )),
        _ => Err("unexpected response from the session daemon".into()),
    }
}

fn control(data_dir: &Path) -> Result<UnixStream, String> {
    let mut stream = connect()?;
    handshake(&mut stream, data_dir)?;
    Ok(stream)
}

fn send(stream: &Arc<Mutex<UnixStream>>, frame: &ClientFrame) -> Result<(), String> {
    let mut stream = stream.lock().map_err(|_| "session connection unavailable")?;
    frame.write(&mut *stream).map_err(|error| error.to_string())
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
        _home: Option<PathBuf>,
        on_data: Channel<Vec<u8>>,
        on_process: Channel<ProcessEvent>,
    ) -> Result<(), String> {
        let mut stream = connect_or_spawn()?;
        handshake(&mut stream, data_dir)?;

        ClientFrame::Open(Open {
            view_id: view_id.clone(),
            rows,
            cols,
            spec: Some(spec.clone()),
        })
        .write(&mut stream)
        .map_err(|error| error.to_string())?;

        let first = DaemonFrame::read(&mut stream).map_err(|error| error.to_string())?;
        if let DaemonFrame::Error { message } = first {
            return Err(message);
        }
        stream
            .set_read_timeout(None)
            .map_err(|error| error.to_string())?;

        let read_half = stream.try_clone().map_err(|error| error.to_string())?;
        let stream = Arc::new(Mutex::new(stream));
        let closing = Arc::new(AtomicBool::new(false));

        let previous = self.sessions.lock().ok().and_then(|mut sessions| {
            sessions.insert(
                view_id,
                Attached {
                    owner: owner.to_string(),
                    stream,
                    closing: Arc::clone(&closing),
                },
            )
        });

        if let Some(previous) = previous {
            previous.closing.store(true, Ordering::SeqCst);
            let _ = send(&previous.stream, &ClientFrame::Detach);
        }

        dispatch(&first, &on_data, &on_process);

        std::thread::spawn(move || {
            let mut reader = BufReader::new(read_half);
            let mut lost = true;
            while let Ok(frame) = DaemonFrame::read(&mut reader) {
                if let DaemonFrame::Detached { reason } = frame {
                    lost = reason == DetachReason::Killed;
                    break;
                }
                if !dispatch(&frame, &on_data, &on_process) {
                    return;
                }
            }

            if lost && !closing.load(Ordering::SeqCst) {
                let _ = on_process.send(ProcessEvent::Exited);
            }
        });

        Ok(())
    }

    pub(crate) fn write(&self, owner: &str, view_id: &str, data: &[u8]) -> Result<(), String> {
        let stream = self.attached(owner, view_id)?;
        send(&stream, &ClientFrame::Input(data.to_vec()))
    }

    pub(crate) fn resize(
        &self,
        owner: &str,
        view_id: &str,
        rows: u16,
        cols: u16,
    ) -> Result<(), String> {
        let stream = self.attached(owner, view_id)?;
        send(&stream, &ClientFrame::Resize(Resize { rows, cols }))
    }

    pub(crate) fn detach(&self, owner: &str, view_id: &str) {
        if let Some(attached) = self.take(owner, view_id) {
            attached.closing.store(true, Ordering::SeqCst);
            let _ = send(&attached.stream, &ClientFrame::Detach);
        }
    }

    pub(crate) fn kill(&self, owner: &str, view_id: &str, data_dir: &Path) {
        if let Some(attached) = self.take(owner, view_id) {
            attached.closing.store(true, Ordering::SeqCst);
            if send(&attached.stream, &ClientFrame::Kill).is_ok() {
                return;
            }
        }

        if let Ok(mut stream) = control(data_dir) {
            let _ = ClientFrame::KillView(ViewId {
                view_id: view_id.to_string(),
            })
            .write(&mut stream);
            let _ = DaemonFrame::read(&mut stream);
        }
    }

    pub(crate) fn list(&self, data_dir: &Path) -> Result<Vec<SessionInfo>, String> {
        let Ok(mut stream) = control(data_dir) else {
            return Ok(Vec::new());
        };
        ClientFrame::List
            .write(&mut stream)
            .map_err(|error| error.to_string())?;
        match DaemonFrame::read(&mut stream).map_err(|error| error.to_string())? {
            DaemonFrame::Sessions(sessions) => Ok(sessions),
            _ => Err("unexpected response from the session daemon".into()),
        }
    }

    pub(crate) fn close_window(&self, owner: &str) {
        let owned = self
            .sessions
            .lock()
            .map(|sessions| {
                sessions
                    .iter()
                    .filter(|(_, attached)| attached.owner == owner)
                    .map(|(view_id, _)| view_id.clone())
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for view_id in owned {
            self.detach(owner, &view_id);
        }
    }

    fn take(&self, owner: &str, view_id: &str) -> Option<Attached> {
        let mut sessions = self.sessions.lock().ok()?;
        if !sessions
            .get(view_id)
            .is_some_and(|attached| attached.owner == owner)
        {
            return None;
        }
        sessions.remove(view_id)
    }

    fn attached(&self, owner: &str, view_id: &str) -> Result<Arc<Mutex<UnixStream>>, String> {
        let sessions = self.sessions.lock().map_err(|_| "PTY state unavailable")?;
        let attached = sessions.get(view_id).ok_or("PTY session not found")?;
        if attached.owner != owner {
            return Err("PTY session belongs to another window".into());
        }
        Ok(Arc::clone(&attached.stream))
    }
}

fn dispatch(
    frame: &DaemonFrame,
    on_data: &Channel<Vec<u8>>,
    on_process: &Channel<ProcessEvent>,
) -> bool {
    match frame {
        DaemonFrame::Data(bytes) | DaemonFrame::Snapshot(bytes) => {
            on_data.send(bytes.clone()).is_ok()
        }
        DaemonFrame::Process(event) => on_process.send(event.clone()).is_ok(),
        _ => true,
    }
}
