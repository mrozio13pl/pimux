//! the pimux session daemon
//! the daemon outlives the app, it owns every pty
//! no windows support

mod session;

use crate::protocol::{ClientFrame, DaemonFrame, Hello, Open, ViewId, PROTOCOL_VERSION};
use crate::session::SessionInfo;
use session::{ClientQueue, DaemonSession};
use std::{
    collections::HashMap,
    io::{self, BufReader, Write},
    os::{
        fd::AsRawFd,
        unix::{
            fs::{OpenOptionsExt, PermissionsExt},
            net::{UnixListener, UnixStream},
            process::CommandExt,
        },
    },
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Condvar, Mutex,
    },
    time::{Duration, Instant},
};

const SOCKET_NAME: &str = "daemon.sock";
const LOCK_NAME: &str = "daemon.lock";
const DEFAULT_IDLE_MS: u64 = 5_000;
const WATCHDOG_INTERVAL: Duration = Duration::from_secs(2);

pub(crate) fn runtime_dir() -> Result<PathBuf, String> {
    let directory = if let Some(directory) = std::env::var_os("PIMUX_RUNTIME_DIR") {
        PathBuf::from(directory)
    } else if let Some(runtime) = std::env::var_os("XDG_RUNTIME_DIR") {
        PathBuf::from(runtime).join("pimux")
    } else {
        let temporary = std::env::var_os("TMPDIR")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        temporary.join(format!("pimux-{}", unsafe { libc::getuid() }))
    };
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let _ = std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700));
    Ok(directory)
}

/// `sun_path` is 108 bytes on linux and 104 on mac, and a path over the limit fails at `bind` with a bare "invalid argument"
/// check it here so an oversized `PIMUX_RUNTIME_DIR` says what is actually wrong
const MAX_SOCKET_PATH: usize = 100;

pub(crate) fn socket_path() -> Result<PathBuf, String> {
    let path = runtime_dir()?.join(SOCKET_NAME);
    if path.as_os_str().len() > MAX_SOCKET_PATH {
        return Err(format!(
            "socket path {} is too long for a unix socket",
            path.display()
        ));
    }
    Ok(path)
}

fn idle_grace() -> Duration {
    Duration::from_millis(
        std::env::var("PIMUX_DAEMON_IDLE_MS")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(DEFAULT_IDLE_MS),
    )
}

pub(crate) fn connect() -> Result<UnixStream, String> {
    UnixStream::connect(socket_path()?).map_err(|error| error.to_string())
}

fn appimage() -> Option<PathBuf> {
    let path = PathBuf::from(std::env::var_os("APPIMAGE")?);
    path.is_file().then_some(path)
}

pub(crate) fn spawn_daemon() -> Result<(), String> {
    let mut command = match appimage() {
        Some(image) => {
            let mut command = Command::new("/bin/sh");
            command
                .arg("-c")
                .arg(r#""$0" --daemon >/dev/null 2>&1 </dev/null &"#)
                .arg(image);
            command
        }
        None => {
            let executable = std::env::current_exe().map_err(|error| error.to_string())?;
            let mut command = Command::new(executable);
            command.arg("--daemon");
            command
        }
    };
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    unsafe {
        command.pre_exec(|| {
            if libc::setsid() < 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let mut child = command.spawn().map_err(|error| error.to_string())?;

    let _ = child.wait();
    Ok(())
}

pub(crate) fn connect_or_spawn() -> Result<UnixStream, String> {
    if let Ok(stream) = connect() {
        return Ok(stream);
    }
    spawn_daemon()?;
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
        if let Ok(stream) = connect() {
            return Ok(stream);
        }
    }
    Err("session daemon did not start".into())
}

struct Daemon {
    sessions: Mutex<HashMap<String, Arc<DaemonSession>>>,
    data_dir: Mutex<Option<PathBuf>>,
    socket: PathBuf,
    idle: Duration,
    next_token: AtomicU64,
    shutting_down: AtomicBool,
    wake: Condvar,
    woken: Mutex<bool>,
}

impl Daemon {
    fn new(socket: PathBuf, idle: Duration) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            data_dir: Mutex::new(None),
            socket,
            idle,
            next_token: AtomicU64::new(1),
            shutting_down: AtomicBool::new(false),
            wake: Condvar::new(),
            woken: Mutex::new(false),
        }
    }

    fn nudge(&self) {
        if let Ok(mut woken) = self.woken.lock() {
            *woken = true;
        }
        self.wake.notify_all();
    }

    fn list(&self) -> Vec<SessionInfo> {
        self.sessions
            .lock()
            .map(|sessions| sessions.values().map(|session| session.info()).collect())
            .unwrap_or_default()
    }

    fn get(&self, view_id: &str) -> Option<Arc<DaemonSession>> {
        self.sessions
            .lock()
            .ok()
            .and_then(|sessions| sessions.get(view_id).cloned())
    }

    fn kill(&self, view_id: &str) {
        let session = self
            .sessions
            .lock()
            .ok()
            .and_then(|mut sessions| sessions.remove(view_id));
        if let Some(session) = session {
            session.kill();
        }
    }

    fn open(self: &Arc<Self>, open: &Open) -> Result<Arc<DaemonSession>, String> {
        if let Some(session) = self.get(&open.view_id) {
            if session.alive() || !session.expired() {
                return Ok(session);
            }
            self.kill(&open.view_id);
        }
        let spec = open
            .spec
            .as_ref()
            .ok_or("session is no longer running")?;
        let data_dir = self
            .data_dir
            .lock()
            .ok()
            .and_then(|directory| directory.clone())
            .ok_or("client did not supply an application data directory")?;

        let mut sessions = self.sessions.lock().map_err(|_| "daemon state unavailable")?;
        if self.shutting_down.load(Ordering::SeqCst) {
            return Err("session daemon is shutting down".into());
        }
        let daemon = Arc::clone(self);
        let session = DaemonSession::spawn(
            open.view_id.clone(),
            spec,
            open.rows,
            open.cols,
            &data_dir,
            std::env::var_os("HOME").map(PathBuf::from),
            Box::new(move || daemon.nudge()),
        )?;
        sessions.insert(open.view_id.clone(), Arc::clone(&session));
        Ok(session)
    }

    fn watch(self: &Arc<Self>) {
        let mut idle_since = Some(Instant::now());
        loop {
            if let Ok(mut sessions) = self.sessions.lock() {
                sessions.retain(|_, session| !session.expired());
                if sessions.values().any(|session| session.alive()) {
                    idle_since = None;
                } else if idle_since.is_none() {
                    idle_since = Some(Instant::now());
                }
                if idle_since.is_some_and(|since| since.elapsed() >= self.idle) {
                    drop(sessions);
                    self.shutdown();
                    return;
                }
            }
            if let Ok(woken) = self.woken.lock() {
                let (mut woken, _) = self
                    .wake
                    .wait_timeout(woken, WATCHDOG_INTERVAL)
                    .unwrap_or_else(|error| error.into_inner());
                *woken = false;
            }
        }
    }

    fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        let _ = UnixStream::connect(&self.socket);
        let _ = std::fs::remove_file(&self.socket);
    }
}

#[cfg(target_os = "linux")]
fn peer_uid(stream: &UnixStream) -> Option<u32> {
    let mut credentials: libc::ucred = unsafe { std::mem::zeroed() };
    let mut length = std::mem::size_of::<libc::ucred>() as libc::socklen_t;
    let result = unsafe {
        libc::getsockopt(
            stream.as_raw_fd(),
            libc::SOL_SOCKET,
            libc::SO_PEERCRED,
            std::ptr::addr_of_mut!(credentials).cast(),
            &mut length,
        )
    };
    (result == 0).then_some(credentials.uid)
}

#[cfg(not(target_os = "linux"))]
fn peer_uid(stream: &UnixStream) -> Option<u32> {
    let mut uid = 0;
    let mut gid = 0;
    let result = unsafe { libc::getpeereid(stream.as_raw_fd(), &mut uid, &mut gid) };
    (result == 0).then_some(uid)
}

fn pump(queue: Arc<ClientQueue>, mut stream: UnixStream) {
    while let Some(frames) = queue.drain() {
        for frame in frames {
            if frame.write(&mut stream).is_err() {
                queue.close();
                return;
            }
        }
    }
    let _ = stream.flush();
}

fn handle(daemon: Arc<Daemon>, stream: UnixStream) {
    if peer_uid(&stream) != Some(unsafe { libc::getuid() }) {
        return;
    }
    let Ok(read_half) = stream.try_clone() else {
        return;
    };
    let mut reader = BufReader::new(read_half);
    let mut writer = stream;

    let Ok(ClientFrame::Hello(Hello {
        protocol,
        app_data_dir,
    })) = ClientFrame::read(&mut reader)
    else {
        return;
    };
    if protocol != PROTOCOL_VERSION {
        let _ = DaemonFrame::VersionMismatch {
            version: PROTOCOL_VERSION,
        }
        .write(&mut writer);
        return;
    }
    if let Ok(mut directory) = daemon.data_dir.lock() {
        *directory = Some(app_data_dir);
    }
    if (DaemonFrame::HelloOk {
        version: PROTOCOL_VERSION,
    })
    .write(&mut writer)
    .is_err()
    {
        return;
    }

    let (session, token, queue) = loop {
        match ClientFrame::read(&mut reader) {
            Ok(ClientFrame::List) => {
                if DaemonFrame::Sessions(daemon.list()).write(&mut writer).is_err() {
                    return;
                }
            }
            Ok(ClientFrame::KillView(ViewId { view_id })) => {
                daemon.kill(&view_id);
                daemon.nudge();
                if DaemonFrame::Ok.write(&mut writer).is_err() {
                    return;
                }
            }
            Ok(ClientFrame::Open(open)) => match daemon.open(&open) {
                Ok(session) => {
                    let token = daemon.next_token.fetch_add(1, Ordering::Relaxed);
                    let queue = Arc::new(ClientQueue::new());
                    session.attach(token, &queue, open.rows, open.cols);
                    break (session, token, queue);
                }
                Err(message) => {
                    if (DaemonFrame::Error { message }).write(&mut writer).is_err() {
                        return;
                    }
                }
            },
            Ok(_) => {
                if (DaemonFrame::Error {
                    message: "unexpected frame before open".into(),
                })
                .write(&mut writer)
                .is_err()
                {
                    return;
                }
            }
            Err(_) => return,
        }
    };

    let pumping = Arc::clone(&queue);
    let pumper = writer
        .try_clone()
        .ok()
        .map(|stream| std::thread::spawn(move || pump(pumping, stream)));

    loop {
        match ClientFrame::read(&mut reader) {
            Ok(ClientFrame::Input(bytes)) => {
                let _ = session.write_input(&bytes);
            }
            Ok(ClientFrame::Resize(resize)) => {
                let _ = session.resize(resize.rows, resize.cols);
            }
            Ok(ClientFrame::Detach) | Err(_) => break,
            Ok(ClientFrame::Kill) => {
                daemon.kill(&session.view_id);
                daemon.nudge();
                break;
            }
            Ok(_) => {}
        }
    }

    session.detach(token);
    queue.close();
    if let Some(pumper) = pumper {
        let _ = pumper.join();
    }
}

fn detach_io() {
    let log = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/state")))
        .map(|state| state.join("pimux"));
    let log = log.and_then(|directory| {
        std::fs::create_dir_all(&directory).ok()?;
        let mut options = std::fs::OpenOptions::new();
        options.append(true).create(true).mode(0o600);
        options.open(directory.join("daemon.log")).ok()
    });

    unsafe {
        let null = libc::open(c"/dev/null".as_ptr(), libc::O_RDWR);
        if null >= 0 {
            libc::dup2(null, 0);
            if log.is_none() {
                libc::dup2(null, 1);
                libc::dup2(null, 2);
            }
            if null > 2 {
                libc::close(null);
            }
        }
        if let Some(log) = &log {
            libc::dup2(log.as_raw_fd(), 1);
            libc::dup2(log.as_raw_fd(), 2);
        }
        drop(log);
        if appimage().is_none() {
            for fd in 3..1024 {
                libc::close(fd);
            }
        }
    }
}

fn acquire_lock(path: &Path) -> Option<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).mode(0o600);
    let file = options.open(path).ok()?;
    let locked = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
    (locked == 0).then_some(file)
}

fn serve(directory: &Path, idle: Duration) -> Result<bool, String> {
    let Some(lock) = acquire_lock(&directory.join(LOCK_NAME)) else {
        return Ok(false);
    };

    let socket = directory.join(SOCKET_NAME);
    let _ = std::fs::remove_file(&socket);
    let listener = UnixListener::bind(&socket).map_err(|error| error.to_string())?;
    let _ = std::fs::set_permissions(&socket, std::fs::Permissions::from_mode(0o600));

    let daemon = Arc::new(Daemon::new(socket, idle));
    let watching = Arc::clone(&daemon);
    std::thread::spawn(move || watching.watch());

    for stream in listener.incoming() {
        if daemon.shutting_down.load(Ordering::SeqCst) {
            break;
        }
        let Ok(stream) = stream else { continue };
        let daemon = Arc::clone(&daemon);
        std::thread::spawn(move || handle(daemon, stream));
    }

    drop(lock);
    Ok(true)
}

pub fn run() -> ! {
    if appimage().is_none() {
        match unsafe { libc::fork() } {
            -1 => std::process::exit(1),
            0 => {}
            _ => std::process::exit(0),
        }
    }

    detach_io();

    unsafe {
        libc::chdir(c"/".as_ptr());
    }

    let Ok(directory) = runtime_dir() else {
        std::process::exit(1);
    };
    match serve(&directory, idle_grace()) {
        Ok(_) => std::process::exit(0),
        Err(_) => std::process::exit(1),
    }
}

#[cfg(test)]
mod tests {
    use super::{acquire_lock, serve, LOCK_NAME, SOCKET_NAME};
    use crate::protocol::{
        ClientFrame, DaemonFrame, DetachReason, Hello, Open, Resize, ViewId, PROTOCOL_VERSION,
    };
    use crate::session::SpawnSpec;
    use std::{
        io::BufReader,
        os::unix::net::UnixStream,
        path::{Path, PathBuf},
        sync::mpsc::{channel, Receiver, RecvTimeoutError},
        thread::JoinHandle,
        time::{Duration, Instant},
    };

    const BUSY: Duration = Duration::from_secs(60);
    const PATIENCE: Duration = Duration::from_secs(20);

    struct Daemon {
        directory: PathBuf,
        handle: Option<JoinHandle<Result<bool, String>>>,
    }

    impl Daemon {
        fn start(name: &str, idle: Duration) -> Self {
            let directory = std::env::temp_dir().join(format!(
                "pimux-daemon-test-{}-{name}",
                std::process::id()
            ));
            let _ = std::fs::remove_dir_all(&directory);
            std::fs::create_dir_all(&directory).unwrap();
            let serving = directory.clone();
            let handle = std::thread::spawn(move || serve(&serving, idle));

            let socket = directory.join(SOCKET_NAME);
            let deadline = Instant::now() + PATIENCE;
            while !socket.exists() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(5));
            }
            assert!(socket.exists(), "daemon never bound its socket");
            Self {
                directory,
                handle: Some(handle),
            }
        }

        fn socket(&self) -> PathBuf {
            self.directory.join(SOCKET_NAME)
        }

        fn client(&self) -> Client {
            Client::connect(&self.socket(), &self.directory)
        }

        fn silent_client(&self) -> UnixStream {
            let mut stream = UnixStream::connect(self.socket()).unwrap();
            handshake(&mut stream, &self.directory);
            stream
        }
    }

    impl Drop for Daemon {
        fn drop(&mut self) {
            if let Ok(mut stream) = UnixStream::connect(self.socket()) {
                handshake(&mut stream, &self.directory);
                let _ = ClientFrame::List.write(&mut stream);
                if let Ok(DaemonFrame::Sessions(sessions)) = DaemonFrame::read(&mut stream) {
                    for session in sessions {
                        let _ = ClientFrame::KillView(ViewId {
                            view_id: session.view_id,
                        })
                        .write(&mut stream);
                        let _ = DaemonFrame::read(&mut stream);
                    }
                }
            }
            let _ = std::fs::remove_dir_all(&self.directory);
            drop(self.handle.take());
        }
    }

    fn handshake(stream: &mut UnixStream, data_dir: &Path) {
        ClientFrame::Hello(Hello {
            protocol: PROTOCOL_VERSION,
            app_data_dir: data_dir.to_path_buf(),
        })
        .write(stream)
        .unwrap();
        assert!(matches!(
            DaemonFrame::read(stream).unwrap(),
            DaemonFrame::HelloOk { .. }
        ));
    }

    struct Client {
        stream: UnixStream,
        frames: Receiver<DaemonFrame>,
    }

    impl Client {
        fn connect(socket: &Path, data_dir: &Path) -> Self {
            let mut stream = UnixStream::connect(socket).unwrap();
            handshake(&mut stream, data_dir);
            let read_half = stream.try_clone().unwrap();
            let (sender, frames) = channel();
            std::thread::spawn(move || {
                let mut reader = BufReader::new(read_half);
                while let Ok(frame) = DaemonFrame::read(&mut reader) {
                    if sender.send(frame).is_err() {
                        break;
                    }
                }
            });
            Self { stream, frames }
        }

        fn send(&mut self, frame: &ClientFrame) {
            frame.write(&mut self.stream).unwrap();
        }

        fn crash(self) {
            self.stream.shutdown(std::net::Shutdown::Both).unwrap();
        }

        fn open(&mut self, view_id: &str, rows: u16, cols: u16, spec: Option<SpawnSpec>) {
            self.send(&ClientFrame::Open(Open {
                view_id: view_id.into(),
                rows,
                cols,
                spec,
            }));
        }

        fn wait_for_text(&self, needle: &str) -> String {
            let deadline = Instant::now() + PATIENCE;
            let mut text = String::new();
            while Instant::now() < deadline {
                match self.frames.recv_timeout(Duration::from_millis(250)) {
                    Ok(DaemonFrame::Data(bytes)) | Ok(DaemonFrame::Snapshot(bytes)) => {
                        text.push_str(&String::from_utf8_lossy(&bytes));
                        if text.contains(needle) {
                            return text;
                        }
                    }
                    Ok(_) => {}
                    Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            text
        }

        fn wait_for(&self, matches: impl Fn(&DaemonFrame) -> bool) -> Option<DaemonFrame> {
            let deadline = Instant::now() + PATIENCE;
            while Instant::now() < deadline {
                match self.frames.recv_timeout(Duration::from_millis(250)) {
                    Ok(frame) if matches(&frame) => return Some(frame),
                    Ok(_) | Err(RecvTimeoutError::Timeout) => {}
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
            None
        }
    }

    fn shell(command: &str) -> SpawnSpec {
        SpawnSpec {
            cwd: "/".into(),
            source_id: "builtin:shell".into(),
            executable: Some(command.into()),
            session_id: None,
            resume_session: false,
            pi_extension: None,
            claude_settings: None,
        }
    }

    fn sessions(daemon: &Daemon) -> Vec<crate::session::SessionInfo> {
        let mut stream = UnixStream::connect(daemon.socket()).unwrap();
        handshake(&mut stream, &daemon.directory);
        ClientFrame::List.write(&mut stream).unwrap();
        match DaemonFrame::read(&mut stream).unwrap() {
            DaemonFrame::Sessions(sessions) => sessions,
            other => panic!("expected a session list, got {other:?}"),
        }
    }

    #[test]
    fn a_detached_session_is_reattachable_with_its_output() {
        let daemon = Daemon::start("reattach", BUSY);
        let mut client = daemon.client();
        client.open(
            "view",
            24,
            80,
            Some(shell("sh -c \"echo hello-detach; sleep 60\"")),
        );
        assert!(client.wait_for_text("hello-detach").contains("hello-detach"));

        client.send(&ClientFrame::Detach);
        drop(client);

        let mut reattached = daemon.client();
        reattached.open("view", 24, 80, None);
        assert!(
            reattached.wait_for_text("hello-detach").contains("hello-detach"),
            "the snapshot should carry the output produced before detaching"
        );
    }

    #[test]
    fn a_crashed_client_leaves_its_child_running() {
        let daemon = Daemon::start("crash", BUSY);
        let mut client = daemon.client();
        client.open(
            "view",
            24,
            80,
            Some(shell("sh -c \"echo still-here; sleep 60\"")),
        );
        client.wait_for_text("still-here");

        client.crash();
        std::thread::sleep(Duration::from_millis(200));

        let live = sessions(&daemon);
        assert_eq!(live.len(), 1);
        assert!(live[0].alive, "the child must outlive its client");
        assert!(!live[0].attached);

        let mut reattached = daemon.client();
        reattached.open("view", 24, 80, None);
        assert!(reattached.wait_for_text("still-here").contains("still-here"));
    }

    #[test]
    fn a_second_open_steals_the_session() {
        let daemon = Daemon::start("steal", BUSY);
        let mut first = daemon.client();
        first.open("view", 24, 80, Some(shell("sh -c \"echo owned; sleep 60\"")));
        first.wait_for_text("owned");

        let mut second = daemon.client();
        second.open("view", 24, 80, None);

        let stolen = first.wait_for(|frame| matches!(frame, DaemonFrame::Detached { .. }));
        assert!(matches!(
            stolen,
            Some(DaemonFrame::Detached {
                reason: DetachReason::Stolen
            })
        ));
        assert!(second.wait_for_text("owned").contains("owned"));
    }

    #[test]
    fn a_client_that_never_reads_does_not_stall_the_pty() {
        let daemon = Daemon::start("overflow", BUSY);
        let mut client = daemon.silent_client();
        ClientFrame::Open(Open {
            view_id: "view".into(),
            rows: 24,
            cols: 80,
            spec: Some(shell(
                "sh -c \"dd if=/dev/zero bs=65536 count=96 2>/dev/null | tr '\\\\0' 'x'\"",
            )),
        })
        .write(&mut client)
        .unwrap();

        let deadline = Instant::now() + PATIENCE;
        let mut finished = false;
        while Instant::now() < deadline {
            if sessions(&daemon).iter().all(|session| !session.alive) {
                finished = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        assert!(
            finished,
            "the PTY reader blocked on a client that never read"
        );
        drop(client);
    }

    #[test]
    fn a_resize_while_detached_reaches_the_child() {
        let daemon = Daemon::start("resize", BUSY);
        let mut client = daemon.client();
        client.open("view", 24, 80, Some(shell("sh")));
        client.send(&ClientFrame::Input(b"stty size\n".to_vec()));
        assert!(
            client.wait_for_text("24 80").contains("24 80"),
            "the session should start at the size it was opened with"
        );

        client.send(&ClientFrame::Detach);
        drop(client);

        let mut reattached = daemon.client();
        reattached.open("view", 30, 100, None);
        reattached.send(&ClientFrame::Input(b"stty size\n".to_vec()));
        assert!(reattached.wait_for_text("30 100").contains("30 100"));
    }

    #[test]
    fn an_explicit_resize_reaches_the_child() {
        let daemon = Daemon::start("resize-live", BUSY);
        let mut client = daemon.client();
        client.open("view", 24, 80, Some(shell("sh")));
        client.wait_for_text("$");
        client.send(&ClientFrame::Resize(Resize {
            rows: 40,
            cols: 120,
        }));
        client.send(&ClientFrame::Input(b"stty size\n".to_vec()));
        assert!(client.wait_for_text("40 120").contains("40 120"));
    }

    #[test]
    fn killing_a_session_tells_the_attached_client() {
        let daemon = Daemon::start("kill", BUSY);
        let mut client = daemon.client();
        client.open("view", 24, 80, Some(shell("sh -c \"echo up; sleep 60\"")));
        client.wait_for_text("up");

        let mut control = UnixStream::connect(daemon.socket()).unwrap();
        handshake(&mut control, &daemon.directory);
        ClientFrame::KillView(ViewId {
            view_id: "view".into(),
        })
        .write(&mut control)
        .unwrap();
        assert!(matches!(
            DaemonFrame::read(&mut control).unwrap(),
            DaemonFrame::Ok
        ));

        assert!(matches!(
            client.wait_for(|frame| matches!(frame, DaemonFrame::Detached { .. })),
            Some(DaemonFrame::Detached {
                reason: DetachReason::Killed
            })
        ));
        assert!(sessions(&daemon).is_empty());
    }

    #[test]
    fn attaching_to_a_missing_session_without_a_spec_is_an_error() {
        let daemon = Daemon::start("cold", BUSY);
        let mut client = daemon.client();
        client.open("nothing-here", 24, 80, None);
        assert!(matches!(
            client.wait_for(|frame| matches!(frame, DaemonFrame::Error { .. })),
            Some(DaemonFrame::Error { .. })
        ));
    }

    #[test]
    fn only_one_daemon_binds() {
        let daemon = Daemon::start("lock", BUSY);
        let lock = daemon.directory.join(LOCK_NAME);
        assert!(
            acquire_lock(&lock).is_none(),
            "the serving daemon must hold the lock for its lifetime"
        );
        // A losing daemon reports that it did not bind, rather than failing.
        assert_eq!(serve(&daemon.directory, BUSY), Ok(false));
    }

    #[test]
    fn an_idle_daemon_unlinks_its_socket_and_exits() {
        let mut daemon = Daemon::start("idle", Duration::from_millis(150));
        let socket = daemon.socket();
        let served = daemon
            .handle
            .take()
            .unwrap()
            .join()
            .expect("the daemon thread panicked");
        assert_eq!(served, Ok(true));
        assert!(!socket.exists(), "the socket should be unlinked on exit");
    }

    #[test]
    fn a_protocol_mismatch_is_rejected_rather_than_misparsed() {
        let daemon = Daemon::start("version", BUSY);
        let mut stream = UnixStream::connect(daemon.socket()).unwrap();
        ClientFrame::Hello(Hello {
            protocol: PROTOCOL_VERSION + 1,
            app_data_dir: daemon.directory.clone(),
        })
        .write(&mut stream)
        .unwrap();
        assert!(matches!(
            DaemonFrame::read(&mut stream).unwrap(),
            DaemonFrame::VersionMismatch {
                version: PROTOCOL_VERSION
            }
        ));
    }
}
