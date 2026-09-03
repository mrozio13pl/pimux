use crate::custom_sources::{custom_source_command, parse_command};
use portable_pty::{CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    fs::OpenOptions,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ViewStatus {
    Idle,
    Error,
    Finished,
    Working,
    Attention,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SourceViewUpdate {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) status: Option<ViewStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) user_submitted: Option<bool>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum ProcessEvent {
    Started { title: String },
    Idle,
    Exited,
    Update { update: SourceViewUpdate },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SessionInfo {
    pub(crate) view_id: String,
    pub(crate) pid: Option<u32>,
    pub(crate) alive: bool,
    pub(crate) source_id: String,
    pub(crate) cwd: String,
    pub(crate) attached: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SpawnSpec {
    pub(crate) cwd: String,
    pub(crate) source_id: String,
    pub(crate) executable: Option<String>,
    pub(crate) session_id: Option<String>,
    pub(crate) resume_session: bool,
    pub(crate) pi_extension: Option<PathBuf>,
    pub(crate) claude_settings: Option<PathBuf>,
}

pub(crate) fn validate_size(rows: u16, cols: u16) -> Result<PtySize, String> {
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

fn builtin_command(
    executable: Option<&str>,
    default_program: &str,
) -> Result<CommandBuilder, String> {
    let Some(executable) = executable else {
        return Ok(CommandBuilder::new(default_program));
    };
    let (program, args) = parse_command(executable)?;
    let mut command = CommandBuilder::new(program);
    command.args(args);
    Ok(command)
}

pub(crate) fn source_command(
    source_id: &str,
    executable: Option<&str>,
    pi_extension: Option<&Path>,
    claude_settings: Option<&Path>,
    session_id: Option<&str>,
    resume_session: bool,
    session_exists: bool,
) -> Result<CommandBuilder, String> {
    match source_id {
        "builtin:shell" => match executable {
            Some(executable) => {
                let (program, args) = parse_command(executable)?;
                let mut command = CommandBuilder::new(program);
                command.args(args);
                Ok(command)
            }
            None => Ok(CommandBuilder::new_default_prog()),
        },
        "builtin:pi" => {
            let extension = pi_extension.ok_or("Pi extension resource is missing")?;
            let mut command = builtin_command(executable, "pi")?;
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
        "builtin:claudecode" => {
            let settings = claude_settings.ok_or("Claude Code settings resource is missing")?;
            let mut command = builtin_command(executable, "claude")?;
            command.arg("--settings");
            command.arg(settings);
            if resume_session {
                let session_id = session_id.ok_or("Claude Code resume requires a session ID")?;
                if !valid_claude_session_id(session_id) {
                    return Err("invalid Claude Code session ID".into());
                }
                command.arg("--resume");
                command.arg(session_id);
            }
            Ok(command)
        }
        _ => Err(format!("unknown view source: {source_id}")),
    }
}

pub(crate) fn create_claude_event_file(path: &Path) -> std::io::Result<std::fs::File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

pub(crate) fn valid_claude_session_id(session_id: &str) -> bool {
    session_id.len() == 36
        && session_id
            .chars()
            .enumerate()
            .all(|(index, character)| match index {
                8 | 13 | 18 | 23 => character == '-',
                _ => character.is_ascii_hexdigit(),
            })
}

pub(crate) fn pi_session_exists(root: &Path, session_id: &str) -> bool {
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

pub(crate) fn pi_sessions_dir(home: Option<PathBuf>) -> Option<PathBuf> {
    if let Some(directory) = std::env::var_os("PI_CODING_AGENT_SESSION_DIR") {
        return Some(PathBuf::from(directory));
    }
    std::env::var_os("PI_CODING_AGENT_DIR")
        .map(PathBuf::from)
        .or_else(|| home.map(|home| home.join(".pi/agent")))
        .map(|directory| directory.join("sessions"))
}

pub(crate) fn build_command(
    spec: &SpawnSpec,
    data_dir: &Path,
    home: Option<PathBuf>,
) -> Result<CommandBuilder, String> {
    if spec.source_id.starts_with("custom:") {
        let (program, args) = custom_source_command(data_dir, &spec.source_id)?;
        let mut command = CommandBuilder::new(program);
        command.args(args);
        return Ok(command);
    }

    let session_exists = spec.session_id.as_deref().is_some_and(|session_id| {
        pi_sessions_dir(home).is_some_and(|directory| pi_session_exists(&directory, session_id))
    });

    source_command(
        &spec.source_id,
        spec.executable
            .as_deref()
            .map(str::trim)
            .filter(|executable| !executable.is_empty()),
        spec.pi_extension.as_deref(),
        spec.claude_settings.as_deref(),
        spec.session_id.as_deref(),
        spec.resume_session,
        session_exists,
    )
}

pub(crate) fn canonical_cwd(cwd: &str) -> Result<PathBuf, String> {
    let cwd = PathBuf::from(cwd)
        .canonicalize()
        .map_err(|error| format!("invalid working directory: {error}"))?;
    if !cwd.is_dir() {
        return Err("working directory is not a directory".into());
    }
    Ok(cwd)
}

#[cfg(unix)]
pub(crate) fn foreground_process(root_pid: u32, process_group: Option<i32>) -> Option<i32> {
    process_group.filter(|pid| *pid != root_pid as i32)
}

#[cfg(target_os = "linux")]
pub(crate) fn process_title(pid: i32) -> String {
    std::fs::read_to_string(format!("/proc/{pid}/comm"))
        .ok()
        .map(|title| title.trim().to_string())
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| format!("Process {pid}"))
}

#[cfg(all(unix, not(target_os = "linux")))]
pub(crate) fn process_title(pid: i32) -> String {
    format!("Process {pid}")
}

#[cfg(test)]
mod tests {
    use super::{
        create_claude_event_file, pi_session_exists, source_command, valid_claude_session_id,
        validate_size,
    };
    #[cfg(unix)]
    use super::{foreground_process, process_title};
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
        assert!(
            source_command("builtin:shell", None, None, None, None, false, false)
                .unwrap()
                .is_default_prog()
        );
        let fresh = source_command(
            "builtin:pi",
            None,
            Some(Path::new("pi-extension.ts")),
            None,
            None,
            false,
            false,
        )
        .unwrap();
        assert_eq!(fresh.get_argv().len(), 3);
        let resumed = source_command(
            "builtin:pi",
            None,
            Some(Path::new("pi-extension.ts")),
            None,
            None,
            true,
            false,
        )
        .unwrap();
        assert_eq!(resumed.get_argv()[3], "--resume");
        let stale = source_command(
            "builtin:pi",
            None,
            Some(Path::new("pi-extension.ts")),
            None,
            Some("12345678-abcd"),
            true,
            false,
        )
        .unwrap();
        assert_eq!(stale.get_argv()[3], "--resume");
        let pi = source_command(
            "builtin:pi",
            None,
            Some(Path::new("pi-extension.ts")),
            None,
            Some("12345678-abcd"),
            true,
            true,
        )
        .unwrap();
        assert_eq!(pi.get_argv()[3], "--session");
        assert_eq!(pi.get_argv()[4], "12345678-abcd");
        assert!(source_command(
            "builtin:pi",
            None,
            Some(Path::new("extension.ts")),
            None,
            Some("--bad"),
            false,
            false,
        )
        .is_err());

        let claude = source_command(
            "builtin:claudecode",
            None,
            None,
            Some(Path::new("claude-settings.json")),
            Some("03c1fb51-8987-4b47-a915-15938d5549a5"),
            true,
            false,
        )
        .unwrap();
        assert_eq!(claude.get_argv()[1], "--settings");
        assert_eq!(claude.get_argv()[3], "--resume");
        assert_eq!(claude.get_argv()[4], "03c1fb51-8987-4b47-a915-15938d5549a5");
        assert!(source_command(
            "builtin:claudecode",
            None,
            None,
            Some(Path::new("claude-settings.json")),
            None,
            true,
            false,
        )
        .is_err());
        assert!(source_command("custom:unknown", None, None, None, None, false, false).is_err());
    }

    #[test]
    fn builtin_sources_accept_a_command_override() {
        let shell = source_command(
            "builtin:shell",
            Some("bash --login"),
            None,
            None,
            None,
            false,
            false,
        )
        .unwrap();
        assert!(!shell.is_default_prog());
        assert_eq!(shell.get_argv()[1], "--login");

        let pi = source_command(
            "builtin:pi",
            Some("pi-nightly --verbose"),
            Some(Path::new("pi-extension.ts")),
            None,
            None,
            false,
            false,
        )
        .unwrap();
        assert_eq!(pi.get_argv()[0], "pi-nightly");
        assert_eq!(pi.get_argv()[1], "--verbose");
        assert_eq!(pi.get_argv()[2], "-e");

        let claude = source_command(
            "builtin:claudecode",
            Some("claude-nightly"),
            None,
            Some(Path::new("claude-settings.json")),
            None,
            false,
            false,
        )
        .unwrap();
        assert_eq!(claude.get_argv()[0], "claude-nightly");
        assert_eq!(claude.get_argv()[1], "--settings");

        assert!(source_command(
            "builtin:pi",
            Some("../pi"),
            Some(Path::new("pi-extension.ts")),
            None,
            None,
            false,
            false,
        )
        .is_err());
    }

    #[test]
    fn claude_session_ids_are_uuids() {
        assert!(valid_claude_session_id("03c1fb51-8987-4b47-a915-15938d5549a5"));
        assert!(!valid_claude_session_id("03c1fb51-8987-4b47-a915-15938d5549"));
        assert!(!valid_claude_session_id("03c1fb51x8987-4b47-a915-15938d5549a5"));
    }

    #[test]
    fn claude_event_file_is_exclusive() {
        let path = std::env::temp_dir().join(format!("pimux-event-test-{}", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let file = create_claude_event_file(&path).unwrap();
        assert!(create_claude_event_file(&path).is_err());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(file.metadata().unwrap().permissions().mode() & 0o777, 0o600);
        }
        drop(file);
        std::fs::remove_file(path).unwrap();
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
        assert!(!process_title(std::process::id() as i32).is_empty());
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
