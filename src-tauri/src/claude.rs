use crate::session::{SourceViewUpdate, ViewStatus};
use serde_json::Value;
use std::{
    fs::OpenOptions,
    io::{Read, Seek, SeekFrom, Write},
};

fn clip(value: &str) -> String {
    let normalized = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.chars().count() <= 160 {
        normalized
    } else {
        format!("{}…", normalized.chars().take(159).collect::<String>())
    }
}

fn model_name(value: &Value) -> Option<String> {
    value
        .get("model")
        .and_then(|model| {
            model.as_str().or_else(|| {
                model
                    .get("id")
                    .or_else(|| model.get("display_name"))
                    .and_then(Value::as_str)
            })
        })
        .map(clip)
        .filter(|model| !model.is_empty())
}

fn transcript_title(path: Option<&str>) -> Option<String> {
    let transcript = std::fs::read_to_string(path?).ok()?;
    let mut native = None;
    let mut fallback = None;
    for entry in transcript
        .lines()
        .filter_map(|line| serde_json::from_str::<Value>(line).ok())
    {
        match entry.get("type").and_then(Value::as_str) {
            Some("custom-title") => {
                native = entry.get("customTitle").and_then(Value::as_str).map(clip);
            }
            Some("user") if fallback.is_none() => {
                let Some(content) = entry.pointer("/message/content") else {
                    continue;
                };
                let text = content.as_str().or_else(|| {
                    content.as_array()?.iter().find_map(|block| {
                        (block.get("type").and_then(Value::as_str) == Some("text"))
                            .then(|| block.get("text").and_then(Value::as_str))
                            .flatten()
                    })
                });
                fallback = text.map(clip);
            }
            _ => {}
        }
    }
    native
        .filter(|title| !title.is_empty())
        .or_else(|| fallback.filter(|title| !title.is_empty()))
        .map(|title| title.chars().take(48).collect())
}

fn transcript_model(path: Option<&str>) -> Option<String> {
    let mut file = std::fs::File::open(path?).ok()?;
    let length = file.metadata().ok()?.len();
    let offset = length.saturating_sub(32 * 1024);
    file.seek(SeekFrom::Start(offset)).ok()?;
    let mut tail = String::new();
    file.read_to_string(&mut tail).ok()?;
    tail.lines().rev().find_map(|line| {
        serde_json::from_str::<Value>(line).ok().and_then(|entry| {
            entry
                .pointer("/message/model")
                .and_then(Value::as_str)
                .map(clip)
        })
    })
}

fn input_summary(input: Option<&Value>) -> String {
    let Some(Value::Object(input)) = input else {
        return String::new();
    };
    ["file_path", "path", "command", "query", "pattern"]
        .iter()
        .find_map(|key| input.get(*key).and_then(Value::as_str))
        .or_else(|| input.values().find_map(Value::as_str))
        .map(clip)
        .unwrap_or_default()
}

fn tool_description(value: &Value, completed: bool) -> String {
    let name = value
        .get("tool_name")
        .and_then(Value::as_str)
        .unwrap_or("Tool");
    let detail = input_summary(value.get("tool_input"));
    let verb = if completed {
        if matches!(name, "Write" | "Edit" | "MultiEdit") {
            "Updated"
        } else {
            "Completed"
        }
    } else if name == "Read" {
        "Reading"
    } else if matches!(name, "Write" | "Edit" | "MultiEdit") {
        "Editing"
    } else if name == "Bash" {
        "Running"
    } else {
        "Using"
    };
    clip(&format!(
        "{verb} {}{}",
        if completed && verb == "Completed" {
            name
        } else {
            ""
        },
        if detail.is_empty() {
            String::new()
        } else {
            format!(" {detail}")
        }
    ))
}

pub(crate) fn parse_hook(value: &Value) -> Option<SourceViewUpdate> {
    let event = value.get("hook_event_name")?.as_str()?;
    let session_id = value.get("session_id").and_then(Value::as_str).map(clip);
    let transcript_path = value.get("transcript_path").and_then(Value::as_str);
    let model = model_name(value).or_else(|| transcript_model(transcript_path));
    let title = match event {
        "SessionStart" | "UserPromptSubmit" | "Stop" => {
            transcript_title(transcript_path).or_else(|| {
                (event == "UserPromptSubmit")
                    .then(|| value.get("prompt").and_then(Value::as_str))
                    .flatten()
                    .map(clip)
                    .map(|title| title.chars().take(48).collect())
            })
        }
        _ => None,
    };
    let (description, status, user_submitted) = match event {
        "SessionStart" => (
            Some("New Claude Code instance".into()),
            Some(ViewStatus::Idle),
            None,
        ),
        "UserPromptSubmit" => (
            value.get("prompt").and_then(Value::as_str).map(clip),
            Some(ViewStatus::Working),
            Some(true),
        ),
        "PreToolUse" => (
            Some(tool_description(value, false)),
            Some(ViewStatus::Working),
            None,
        ),
        "PostToolUse" => (
            Some(tool_description(value, true)),
            Some(ViewStatus::Working),
            None,
        ),
        "PostToolUseFailure" => (
            Some(clip(&format!(
                "{} failed: {}",
                value
                    .get("tool_name")
                    .and_then(Value::as_str)
                    .unwrap_or("Tool"),
                value
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("Unknown error")
            ))),
            Some(ViewStatus::Error),
            None,
        ),
        // Claude only notifies when it needs the user: a permission prompt or an
        // idle input box. Neither one is work in progress.
        "Notification" => (
            value
                .get("message")
                .or_else(|| value.get("title"))
                .and_then(Value::as_str)
                .map(clip),
            Some(ViewStatus::Attention),
            None,
        ),
        "Stop" => (
            value
                .get("last_assistant_message")
                .and_then(Value::as_str)
                .map(clip),
            Some(ViewStatus::Finished),
            None,
        ),
        "StopFailure" => (
            Some(clip(
                value
                    .get("error")
                    .or_else(|| value.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("Claude Code failed"),
            )),
            Some(ViewStatus::Error),
            None,
        ),
        // Process exit supplies `finished`; leaving this unset preserves StopFailure errors.
        "SessionEnd" => (None, None, None),
        _ => return None,
    };
    Some(SourceViewUpdate {
        title,
        description,
        status,
        session_id,
        model,
        user_submitted,
    })
}

pub fn run_hook() -> Result<(), String> {
    let path = std::env::var_os("PIMUX_CLAUDE_EVENTS").ok_or("missing Pimux event path")?;
    let mut input = String::new();
    std::io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| error.to_string())?;
    let value = serde_json::from_str(&input).map_err(|error| error.to_string())?;
    let Some(update) = parse_hook(&value) else {
        return Ok(());
    };
    let mut file = OpenOptions::new()
        .append(true)
        .open(path)
        .map_err(|error| error.to_string())?;
    let mut line = serde_json::to_vec(&update).map_err(|error| error.to_string())?;
    line.push(b'\n');
    file.write_all(&line).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::{parse_hook, transcript_title};
    use crate::session::ViewStatus;
    use serde_json::json;

    #[test]
    fn native_transcript_title_overrides_first_prompt() {
        let path = std::env::temp_dir().join(format!("pimux-claude-title-{}", std::process::id()));
        std::fs::write(
            &path,
            concat!(
                "{\"type\":\"user\",\"message\":{\"content\":\"first prompt\"}}\n",
                "{\"type\":\"custom-title\",\"customTitle\":\"Native Title\"}\n"
            ),
        )
        .unwrap();
        assert_eq!(
            transcript_title(path.to_str()).as_deref(),
            Some("Native Title")
        );
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn maps_claude_hooks_to_view_updates() {
        let update = parse_hook(&json!({
            "hook_event_name": "PreToolUse",
            "session_id": "session-1",
            "model": "claude-sonnet",
            "tool_name": "Read",
            "tool_input": { "file_path": "/tmp/main.rs" }
        }))
        .unwrap();
        assert_eq!(update.description.as_deref(), Some("Reading /tmp/main.rs"));
        assert_eq!(update.status, Some(ViewStatus::Working));
        assert_eq!(update.session_id.as_deref(), Some("session-1"));
        assert_eq!(update.model.as_deref(), Some("claude-sonnet"));

        let submitted = parse_hook(&json!({
            "hook_event_name": "UserPromptSubmit",
            "prompt": "Investigate the sidebar title"
        }))
        .unwrap();
        assert_eq!(
            submitted.title.as_deref(),
            Some("Investigate the sidebar title")
        );

        let stopped = parse_hook(&json!({
            "hook_event_name": "Stop",
            "last_assistant_message": "Implemented the feature"
        }))
        .unwrap();
        assert_eq!(
            stopped.description.as_deref(),
            Some("Implemented the feature")
        );
        assert_eq!(stopped.status, Some(ViewStatus::Finished));

        let notified = parse_hook(&json!({
            "hook_event_name": "Notification",
            "message": "Claude is waiting for your input"
        }))
        .unwrap();
        assert_eq!(
            notified.description.as_deref(),
            Some("Claude is waiting for your input")
        );
        assert_eq!(notified.status, Some(ViewStatus::Attention));

        let ended = parse_hook(&json!({ "hook_event_name": "SessionEnd" })).unwrap();
        assert_eq!(ended.status, None);
    }
}
