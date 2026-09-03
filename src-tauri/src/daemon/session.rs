use crate::protocol::{DaemonFrame, DetachReason};
use crate::session::{
    build_command, canonical_cwd, create_claude_event_file, foreground_process, process_title,
    validate_size, ProcessEvent, SessionInfo, SourceViewUpdate, SpawnSpec,
};
use portable_pty::{native_pty_system, Child, MasterPty};
use std::{
    collections::VecDeque,
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    time::{Duration, Instant},
};

const RING_LINES: usize = 200;
const RING_BYTES: usize = 256 * 1024;

const QUEUE_BYTES: usize = 4 * 1024 * 1024;

const EXIT_RETENTION: Duration = Duration::from_secs(60);

struct Ring {
    bytes: VecDeque<u8>,
    lines: usize,
}

impl Ring {
    fn new() -> Self {
        Self {
            bytes: VecDeque::new(),
            lines: 0,
        }
    }

    fn push(&mut self, chunk: &[u8]) {
        self.bytes.extend(chunk);
        self.lines += chunk.iter().filter(|byte| **byte == b'\n').count();
        while self.lines > RING_LINES || self.bytes.len() > RING_BYTES {
            match self.bytes.iter().position(|byte| *byte == b'\n') {
                Some(index) => {
                    self.bytes.drain(..=index);
                    self.lines -= 1;
                }
                None => {
                    self.bytes.clear();
                    self.lines = 0;
                    break;
                }
            }
        }
    }

    fn contents(&self) -> Vec<u8> {
        self.bytes.iter().copied().collect()
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum Push {
    Sent,
    Overflowed,
    Closed,
}

pub(super) struct ClientQueue {
    state: Mutex<QueueState>,
    ready: Condvar,
}

struct QueueState {
    frames: VecDeque<DaemonFrame>,
    bytes: usize,
    closed: bool,
}

impl ClientQueue {
    pub(super) fn new() -> Self {
        Self {
            state: Mutex::new(QueueState {
                frames: VecDeque::new(),
                bytes: 0,
                closed: false,
            }),
            ready: Condvar::new(),
        }
    }

    pub(super) fn push(&self, frame: DaemonFrame) -> Push {
        let Ok(mut state) = self.state.lock() else {
            return Push::Closed;
        };
        if state.closed {
            return Push::Closed;
        }
        if state.bytes + frame.weight() > QUEUE_BYTES {
            state.frames.clear();
            state.bytes = 0;
            self.ready.notify_all();
            return Push::Overflowed;
        }
        state.bytes += frame.weight();
        state.frames.push_back(frame);
        self.ready.notify_all();
        Push::Sent
    }

    pub(super) fn push_forced(&self, frame: DaemonFrame) -> Push {
        let Ok(mut state) = self.state.lock() else {
            return Push::Closed;
        };
        if state.closed {
            return Push::Closed;
        }
        state.bytes += frame.weight();
        state.frames.push_back(frame);
        self.ready.notify_all();
        Push::Sent
    }

    pub(super) fn drain(&self) -> Option<Vec<DaemonFrame>> {
        let mut state = self.state.lock().ok()?;
        loop {
            if !state.frames.is_empty() {
                state.bytes = 0;
                return Some(state.frames.drain(..).collect());
            }
            if state.closed {
                return None;
            }
            state = self.ready.wait(state).ok()?;
        }
    }

    pub(super) fn close(&self) {
        if let Ok(mut state) = self.state.lock() {
            state.closed = true;
        }
        self.ready.notify_all();
    }
}

struct Attachment {
    token: u64,
    queue: Arc<ClientQueue>,
}

pub(super) struct DaemonSession {
    pub(super) view_id: String,
    pub(super) source_id: String,
    pub(super) cwd: String,
    pub(super) pid: Option<u32>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
    parser: Mutex<vt100::Parser>,
    ring: Mutex<Ring>,
    client: Mutex<Option<Attachment>>,
    last_update: Mutex<Option<SourceViewUpdate>>,
    alive: AtomicBool,
    exit: Mutex<Option<ExitRecord>>,
}

struct ExitRecord {
    status: Option<i32>,
    retain_until: Option<Instant>,
}

impl DaemonSession {
    pub(super) fn spawn(
        view_id: String,
        spec: &SpawnSpec,
        rows: u16,
        cols: u16,
        data_dir: &Path,
        home: Option<PathBuf>,
        on_exit: Box<dyn FnOnce() + Send>,
    ) -> Result<Arc<Self>, String> {
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
        let pid = child.process_id();
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| error.to_string())?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| error.to_string())?;

        let session = Arc::new(Self {
            view_id,
            source_id: spec.source_id.clone(),
            cwd: spec.cwd.clone(),
            pid,
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
            parser: Mutex::new(vt100::Parser::new(rows, cols, 0)),
            ring: Mutex::new(Ring::new()),
            client: Mutex::new(None),
            last_update: Mutex::new(None),
            alive: AtomicBool::new(true),
            exit: Mutex::new(None),
        });

        let claude_tail = claude_events.map(|path| spawn_claude_tail(Arc::clone(&session), path));

        if spec.source_id == "builtin:shell" {
            if let Some(pid) = pid {
                spawn_foreground_watch(Arc::clone(&session), pid);
            }
        }

        let reading = Arc::clone(&session);
        std::thread::spawn(move || {
            let mut buffer = [0_u8; 16 * 1024];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) | Err(_) => break,
                    Ok(length) => reading.absorb(&buffer[..length]),
                }
            }
            if let Some((done, drained)) = claude_tail {
                let _ = done.send(());
                let _ = drained.recv_timeout(Duration::from_secs(1));
            }
            reading.finish();
            on_exit();
        });

        Ok(session)
    }

    fn absorb(&self, chunk: &[u8]) {
        if let Ok(mut parser) = self.parser.lock() {
            parser.process(chunk);
        }
        if let Ok(mut ring) = self.ring.lock() {
            ring.push(chunk);
        }
        self.emit(DaemonFrame::Data(chunk.to_vec()));
    }

    fn finish(&self) {
        let status = self
            .child
            .lock()
            .ok()
            .and_then(|mut child| child.wait().ok())
            .map(|status| status.exit_code() as i32);
        self.alive.store(false, Ordering::SeqCst);
        if let Ok(mut exit) = self.exit.lock() {
            *exit = Some(ExitRecord {
                status,
                retain_until: Some(Instant::now() + EXIT_RETENTION),
            });
        }
        self.emit(DaemonFrame::Process(ProcessEvent::Exited));
        self.emit(DaemonFrame::Exit { status });
    }

    fn emit(&self, frame: DaemonFrame) {
        if let DaemonFrame::Process(ProcessEvent::Update { update }) = &frame {
            if let Ok(mut last) = self.last_update.lock() {
                *last = Some(update.clone());
            }
        }
        let Ok(mut client) = self.client.lock() else {
            return;
        };
        let Some(attachment) = client.as_ref() else {
            return;
        };
        match attachment.queue.push(frame) {
            Push::Sent => {}
            Push::Overflowed => {
                let snapshot = self.snapshot();
                attachment.queue.push_forced(DaemonFrame::Snapshot(snapshot));
            }
            Push::Closed => *client = None,
        }
    }

    fn snapshot(&self) -> Vec<u8> {
        self.parser
            .lock()
            .map(|parser| parser.screen().state_formatted())
            .unwrap_or_default()
    }

    pub(super) fn alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }

    pub(super) fn attached(&self) -> bool {
        self.client
            .lock()
            .map(|client| client.is_some())
            .unwrap_or(false)
    }

    pub(super) fn attach(&self, token: u64, queue: &Arc<ClientQueue>, rows: u16, cols: u16) {
        let _ = self.resize(rows, cols);

        let previous = self.client.lock().ok().and_then(|mut client| {
            client.replace(Attachment {
                token,
                queue: Arc::clone(queue),
            })
        });
        if let Some(previous) = previous {
            previous.queue.push_forced(DaemonFrame::Detached {
                reason: DetachReason::Stolen,
            });
            previous.queue.close();
        }

        let alternate = self
            .parser
            .lock()
            .map(|parser| parser.screen().alternate_screen())
            .unwrap_or(false);

        if !alternate {
            let history = self
                .ring
                .lock()
                .map(|ring| ring.contents())
                .unwrap_or_default();
            if !history.is_empty() {
                queue.push_forced(DaemonFrame::Data(history));
            }
        }
        queue.push_forced(DaemonFrame::Snapshot(self.snapshot()));

        if let Some(update) = self.last_update.lock().ok().and_then(|last| last.clone()) {
            queue.push_forced(DaemonFrame::Process(ProcessEvent::Update { update }));
        }

        if let Ok(mut exit) = self.exit.lock() {
            if let Some(record) = exit.as_mut() {
                queue.push_forced(DaemonFrame::Process(ProcessEvent::Exited));
                queue.push_forced(DaemonFrame::Exit {
                    status: record.status,
                });

                record.retain_until = None;
            }
        }
    }

    pub(super) fn detach(&self, token: u64) {
        if let Ok(mut client) = self.client.lock() {
            if client
                .as_ref()
                .is_some_and(|attachment| attachment.token == token)
            {
                if let Some(attachment) = client.take() {
                    attachment.queue.close();
                }
            }
        }
    }

    pub(super) fn write_input(&self, bytes: &[u8]) -> Result<(), String> {
        if bytes.len() > 64 * 1024 {
            return Err("terminal input too large".into());
        }
        let mut writer = self.writer.lock().map_err(|_| "PTY writer unavailable")?;
        writer
            .write_all(bytes)
            .map_err(|error| error.to_string())?;
        writer.flush().map_err(|error| error.to_string())
    }

    pub(super) fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        let size = validate_size(rows, cols)?;
        if self
            .parser
            .lock()
            .is_ok_and(|parser| parser.screen().size() == (rows, cols))
        {
            return Ok(());
        }
        self.master
            .lock()
            .map_err(|_| "PTY master unavailable")?
            .resize(size)
            .map_err(|error| error.to_string())?;
        if let Ok(mut parser) = self.parser.lock() {
            parser.screen_mut().set_size(rows, cols);
        }
        Ok(())
    }

    pub(super) fn kill(&self) {
        if let Ok(mut client) = self.client.lock() {
            if let Some(attachment) = client.take() {
                attachment.queue.push_forced(DaemonFrame::Detached {
                    reason: DetachReason::Killed,
                });
                attachment.queue.close();
            }
        }
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }

    pub(super) fn expired(&self) -> bool {
        if self.alive() {
            return false;
        }
        self.exit
            .lock()
            .map(|exit| match exit.as_ref().and_then(|record| record.retain_until) {
                Some(deadline) => Instant::now() >= deadline,
                None => true,
            })
            .unwrap_or(true)
    }

    pub(super) fn info(&self) -> SessionInfo {
        SessionInfo {
            view_id: self.view_id.clone(),
            pid: self.pid,
            alive: self.alive(),
            source_id: self.source_id.clone(),
            cwd: self.cwd.clone(),
            attached: self.attached(),
        }
    }
}

type ClaudeTail = (
    std::sync::mpsc::Sender<()>,
    std::sync::mpsc::Receiver<()>,
);

fn spawn_claude_tail(session: Arc<DaemonSession>, path: PathBuf) -> ClaudeTail {
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
                            std::thread::sleep(Duration::from_millis(50));
                        }
                    },
                    Ok(_) => {
                        if let Ok(update) = serde_json::from_str(&line) {
                            session.emit(DaemonFrame::Process(ProcessEvent::Update { update }));
                        }
                    }
                    Err(_) => break,
                }
            }
        }
        let _ = std::fs::remove_file(path);
        let _ = drained_sender.send(());
    });
    (done_sender, drained_receiver)
}

fn spawn_foreground_watch(session: Arc<DaemonSession>, root_pid: u32) {
    std::thread::spawn(move || {
        let mut foreground = None;
        while session.alive() {
            let process = session
                .master
                .lock()
                .ok()
                .and_then(|master| foreground_process(root_pid, master.process_group_leader()));
            if process != foreground {
                let event = match process {
                    Some(pid) => ProcessEvent::Started {
                        title: process_title(pid),
                    },
                    None if foreground.is_some() => ProcessEvent::Idle,
                    None => {
                        foreground = process;
                        std::thread::sleep(Duration::from_millis(75));
                        continue;
                    }
                };
                session.emit(DaemonFrame::Process(event));
                foreground = process;
            }
            std::thread::sleep(Duration::from_millis(75));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{ClientQueue, Push, Ring, QUEUE_BYTES, RING_LINES};
    use crate::protocol::DaemonFrame;

    #[test]
    fn ring_trims_whole_lines_only() {
        let mut ring = Ring::new();
        for line in 0..RING_LINES + 50 {
            ring.push(format!("line {line}\n").as_bytes());
        }
        let contents = String::from_utf8(ring.contents()).unwrap();
        assert_eq!(contents.lines().count(), RING_LINES);
        assert!(contents.starts_with("line 50\n"));
        assert!(contents.ends_with("line 249\n"));
    }

    #[test]
    fn ring_discards_a_line_longer_than_its_budget() {
        let mut ring = Ring::new();
        ring.push(&vec![b'x'; super::RING_BYTES + 10]);
        assert!(ring.contents().is_empty());
    }

    #[test]
    fn queue_overflow_asks_for_a_resync_instead_of_blocking() {
        let queue = ClientQueue::new();
        let chunk = vec![0_u8; 64 * 1024];
        let mut outcome = Push::Sent;
        for _ in 0..(QUEUE_BYTES / chunk.len()) + 2 {
            outcome = queue.push(DaemonFrame::Data(chunk.clone()));
            if outcome == Push::Overflowed {
                break;
            }
        }
        assert_eq!(outcome, Push::Overflowed);
        assert!(queue.push_forced(DaemonFrame::Snapshot(vec![1, 2, 3])) == Push::Sent);
        let frames = queue.drain().unwrap();
        assert_eq!(frames.len(), 1);
        assert!(matches!(frames[0], DaemonFrame::Snapshot(_)));
    }

    #[test]
    fn draining_a_closed_queue_ends() {
        let queue = ClientQueue::new();
        queue.push(DaemonFrame::Ok);
        queue.close();
        assert!(queue.drain().is_some());
        assert!(queue.drain().is_none());
        assert_eq!(queue.push(DaemonFrame::Ok), Push::Closed);
    }
}
