use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::UNIX_EPOCH,
};
use tantivy::{
    collector::TopDocs,
    directory::MmapDirectory,
    doc,
    query::{AllQuery, BooleanQuery, Occur, Query, QueryParser, TermQuery},
    schema::{Field, IndexRecordOption, Schema, Value as _, FAST, INDEXED, STORED, STRING, TEXT},
    snippet::SnippetGenerator,
    DocAddress, Index, Order, TantivyDocument, Term,
};
use tauri::{AppHandle, Manager};

const RESULT_LIMIT: usize = 30;
const MESSAGE_LIMIT: usize = 16_000;

#[derive(Clone)]
pub(crate) struct SearchState {
    root: PathBuf,
    lock: Arc<Mutex<()>>,
}

#[derive(Clone, Copy)]
struct Fields {
    source_id: Field,
    source_title: Field,
    session_id: Field,
    path: Field,
    kind: Field,
    title: Field,
    cwd: Field,
    body: Field,
    role: Field,
    modified: Field,
}

#[derive(Default, Deserialize, Serialize)]
struct Catalog {
    files: HashMap<String, IndexedFile>,
}

#[derive(Deserialize, Serialize)]
struct IndexedFile {
    modified: u64,
    size: u64,
}

struct SessionFile {
    path: PathBuf,
    source_id: &'static str,
}

struct Transcript {
    source_id: &'static str,
    session_id: String,
    cwd: String,
    title: String,
    modified: u64,
    messages: Vec<Message>,
}

struct Message {
    role: String,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SessionSearchResult {
    source_id: String,
    session_id: String,
    title: String,
    cwd: String,
    snippet: String,
    role: String,
    modified: u64,
}

impl SearchState {
    pub(crate) fn new(app: &AppHandle) -> Result<Self, String> {
        let root = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?
            .join("session-search");
        Ok(Self {
            root,
            lock: Arc::new(Mutex::new(())),
        })
    }
}

fn schema() -> (Schema, Fields) {
    let mut builder = Schema::builder();
    let fields = Fields {
        source_id: builder.add_text_field("source_id", STRING | STORED),
        source_title: builder.add_text_field("source_title", TEXT),
        session_id: builder.add_text_field("session_id", STRING | STORED),
        path: builder.add_text_field("path", STRING),
        kind: builder.add_text_field("kind", STRING),
        title: builder.add_text_field("title", TEXT | STORED),
        cwd: builder.add_text_field("cwd", TEXT | STORED),
        body: builder.add_text_field("body", TEXT | STORED),
        role: builder.add_text_field("role", STRING | STORED),
        modified: builder.add_u64_field("modified", INDEXED | FAST | STORED),
    };
    (builder.build(), fields)
}

fn open_index(root: &Path) -> Result<(Index, Fields), String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let index_path = root.join("index-v1");
    fs::create_dir_all(&index_path).map_err(|error| error.to_string())?;
    let (schema, fields) = schema();
    let directory = MmapDirectory::open(&index_path).map_err(|error| error.to_string())?;
    let index = Index::open_or_create(directory, schema).map_err(|error| error.to_string())?;
    Ok((index, fields))
}

fn home(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().home_dir().map_err(|error| error.to_string())
}

fn collect_jsonl(root: &Path, source_id: &'static str, output: &mut Vec<SessionFile>) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };
    for entry in entries.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        let path = entry.path();
        if file_type.is_dir() {
            collect_jsonl(&path, source_id, output);
        } else if path
            .extension()
            .is_some_and(|extension| extension == "jsonl")
        {
            output.push(SessionFile { path, source_id });
        }
    }
}

fn discover(app: &AppHandle) -> Result<Vec<SessionFile>, String> {
    let home = home(app)?;
    let pi_root = std::env::var_os("PI_CODING_AGENT_SESSION_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            std::env::var_os("PI_CODING_AGENT_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(".pi/agent"))
                .join("sessions")
        });
    let mut files = Vec::new();
    collect_jsonl(&pi_root, "builtin:pi", &mut files);
    collect_jsonl(
        &home.join(".claude/projects"),
        "builtin:claudecode",
        &mut files,
    );
    Ok(files)
}

fn normalized(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clipped(value: &str, limit: usize) -> String {
    normalized(value).chars().take(limit).collect()
}

fn content_text(content: &Value) -> String {
    match content {
        Value::String(text) => clipped(text, MESSAGE_LIMIT),
        Value::Array(parts) => clipped(
            &parts
                .iter()
                .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join(" "),
            MESSAGE_LIMIT,
        ),
        _ => String::new(),
    }
}

fn fallback_id(path: &Path) -> String {
    path.file_stem()
        .and_then(|name| name.to_str())
        .and_then(|name| name.rsplit('_').next())
        .unwrap_or_default()
        .to_string()
}

fn fallback_title(cwd: &str, first_message: &str) -> String {
    if !first_message.is_empty() {
        return clipped(first_message, 80);
    }
    cwd.trim_end_matches(['/', '\\'])
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or("Session")
        .to_string()
}

fn parse_transcript(file: &SessionFile) -> Result<Transcript, String> {
    let metadata = fs::metadata(&file.path).map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_secs());
    let reader = BufReader::new(File::open(&file.path).map_err(|error| error.to_string())?);
    let mut session_id = fallback_id(&file.path);
    let mut cwd = String::new();
    let mut name = String::new();
    let mut first_message = String::new();
    let mut messages = Vec::new();

    for line in reader.lines().map_while(Result::ok) {
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let entry_type = value
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();

        if file.source_id == "builtin:pi" {
            match entry_type {
                "session" => {
                    if let Some(id) = value.get("id").and_then(Value::as_str) {
                        session_id = id.to_string();
                    }
                    if let Some(directory) = value.get("cwd").and_then(Value::as_str) {
                        cwd = directory.to_string();
                    }
                }
                "session_info" => {
                    if let Some(title) = value.get("name").and_then(Value::as_str) {
                        name = clipped(title, 80);
                    }
                }
                "custom"
                    if value.get("customType").and_then(Value::as_str)
                        == Some("pimux-view-title") =>
                {
                    if let Some(title) = value.pointer("/data/title").and_then(Value::as_str) {
                        name = clipped(title, 80);
                    }
                }
                "message" => {
                    let message = &value["message"];
                    let role = message
                        .get("role")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if role != "user" && role != "assistant" {
                        continue;
                    }
                    let text = content_text(&message["content"]);
                    if text.is_empty() {
                        continue;
                    }
                    if first_message.is_empty() && role == "user" {
                        first_message.clone_from(&text);
                    }
                    messages.push(Message {
                        role: role.to_string(),
                        text,
                    });
                }
                "compaction" | "branch_summary" => {
                    if let Some(summary) = value.get("summary").and_then(Value::as_str) {
                        messages.push(Message {
                            role: "summary".into(),
                            text: clipped(summary, MESSAGE_LIMIT),
                        });
                    }
                }
                _ => {}
            }
        } else {
            if let Some(id) = value.get("sessionId").and_then(Value::as_str) {
                session_id = id.to_string();
            }
            if let Some(directory) = value.get("cwd").and_then(Value::as_str) {
                cwd = directory.to_string();
            }
            if entry_type != "user" && entry_type != "assistant" {
                continue;
            }
            let message = &value["message"];
            let role = message
                .get("role")
                .and_then(Value::as_str)
                .unwrap_or(entry_type);
            let text = content_text(&message["content"]);
            if text.is_empty() {
                continue;
            }
            if first_message.is_empty() && role == "user" {
                first_message.clone_from(&text);
            }
            messages.push(Message {
                role: role.to_string(),
                text,
            });
        }
    }

    if session_id.is_empty() {
        return Err("session has no ID".into());
    }
    let title = if name.is_empty() {
        fallback_title(&cwd, &first_message)
    } else {
        name
    };
    Ok(Transcript {
        source_id: file.source_id,
        session_id,
        cwd,
        title,
        modified,
        messages,
    })
}

fn source_title(source_id: &str) -> &str {
    match source_id {
        "builtin:pi" => "Pi",
        "builtin:claudecode" => "Claude Code",
        _ => source_id,
    }
}

fn add_transcript(
    writer: &tantivy::IndexWriter,
    fields: Fields,
    path: &str,
    transcript: Transcript,
) -> Result<(), String> {
    writer
        .add_document(doc!(
            fields.source_id => transcript.source_id,
            fields.source_title => source_title(transcript.source_id),
            fields.session_id => transcript.session_id.as_str(),
            fields.path => path,
            fields.kind => "session",
            fields.title => transcript.title.as_str(),
            fields.cwd => transcript.cwd.as_str(),
            fields.body => "",
            fields.role => "",
            fields.modified => transcript.modified,
        ))
        .map_err(|error| error.to_string())?;

    for message in transcript.messages {
        writer
            .add_document(doc!(
                fields.source_id => transcript.source_id,
                fields.source_title => source_title(transcript.source_id),
                fields.session_id => transcript.session_id.as_str(),
                fields.path => path,
                fields.kind => "message",
                fields.title => transcript.title.as_str(),
                fields.cwd => transcript.cwd.as_str(),
                fields.body => message.text,
                fields.role => message.role,
                fields.modified => transcript.modified,
            ))
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn refresh(app: &AppHandle, state: &SearchState) -> Result<usize, String> {
    let _guard = state.lock.lock().map_err(|_| "search lock unavailable")?;
    let (index, fields) = open_index(&state.root)?;
    let catalog_path = state.root.join("catalog-v1.json");
    let mut catalog: Catalog = fs::read_to_string(&catalog_path)
        .ok()
        .and_then(|contents| serde_json::from_str(&contents).ok())
        .unwrap_or_default();
    let files = discover(app)?;
    let current_paths = files
        .iter()
        .map(|file| file.path.to_string_lossy().into_owned())
        .collect::<HashSet<_>>();
    let mut writer = index
        .writer(50_000_000)
        .map_err(|error| error.to_string())?;
    let mut changed = 0;

    for stale in catalog
        .files
        .keys()
        .filter(|path| !current_paths.contains(*path))
        .cloned()
        .collect::<Vec<_>>()
    {
        writer.delete_term(Term::from_field_text(fields.path, &stale));
        catalog.files.remove(&stale);
        changed += 1;
    }

    for file in files {
        let path = file.path.to_string_lossy().into_owned();
        let metadata = match fs::metadata(&file.path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |duration| duration.as_secs());
        let marker = IndexedFile {
            modified,
            size: metadata.len(),
        };
        if catalog.files.get(&path).is_some_and(|current| {
            current.modified == marker.modified && current.size == marker.size
        }) {
            continue;
        }
        let Ok(transcript) = parse_transcript(&file) else {
            continue;
        };
        writer.delete_term(Term::from_field_text(fields.path, &path));
        add_transcript(&writer, fields, &path, transcript)?;
        catalog.files.insert(path, marker);
        changed += 1;
    }

    if changed > 0 {
        writer.commit().map_err(|error| error.to_string())?;
        fs::write(
            catalog_path,
            serde_json::to_vec(&catalog).map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
    }
    Ok(changed)
}

fn stored_text(document: &TantivyDocument, field: Field) -> String {
    document
        .get_first(field)
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string()
}

fn result_from_doc(
    document: &TantivyDocument,
    fields: Fields,
    snippet: String,
) -> SessionSearchResult {
    SessionSearchResult {
        source_id: stored_text(document, fields.source_id),
        session_id: stored_text(document, fields.session_id),
        title: stored_text(document, fields.title),
        cwd: stored_text(document, fields.cwd),
        snippet,
        role: stored_text(document, fields.role),
        modified: document
            .get_first(fields.modified)
            .and_then(|value| value.as_u64())
            .unwrap_or_default(),
    }
}

fn session_filter(fields: Fields, kind: &str) -> Box<dyn Query> {
    Box::new(TermQuery::new(
        Term::from_field_text(fields.kind, kind),
        IndexRecordOption::Basic,
    ))
}

fn search(state: &SearchState, query_text: &str) -> Result<Vec<SessionSearchResult>, String> {
    let _guard = state.lock.lock().map_err(|_| "search lock unavailable")?;
    let (index, fields) = open_index(&state.root)?;
    let reader = index.reader().map_err(|error| error.to_string())?;
    let searcher = reader.searcher();

    if query_text.trim().is_empty() {
        let query = BooleanQuery::new(vec![
            (Occur::Must, Box::new(AllQuery)),
            (Occur::Must, session_filter(fields, "session")),
        ]);
        let docs: Vec<(Option<u64>, DocAddress)> = searcher
            .search(
                &query,
                &TopDocs::with_limit(RESULT_LIMIT)
                    .order_by_fast_field::<u64>("modified", Order::Desc),
            )
            .map_err(|error| error.to_string())?;
        return docs
            .into_iter()
            .map(|(_, address)| {
                searcher
                    .doc::<TantivyDocument>(address)
                    .map(|document| result_from_doc(&document, fields, String::new()))
                    .map_err(|error| error.to_string())
            })
            .collect();
    }

    let mut parser = QueryParser::for_index(
        &index,
        vec![fields.title, fields.cwd, fields.source_title, fields.body],
    );
    parser.set_field_boost(fields.title, 5.0);
    parser.set_field_boost(fields.source_title, 3.0);
    parser.set_field_boost(fields.body, 2.0);
    let (text_query, _) = parser.parse_query_lenient(query_text);
    let mut snippets = SnippetGenerator::create(&searcher, &*text_query, fields.body)
        .map_err(|error| error.to_string())?;
    snippets.set_max_num_chars(180);
    let query = BooleanQuery::new(vec![
        (Occur::Must, text_query),
        (Occur::Must, session_filter(fields, "message")),
    ]);
    let docs = searcher
        .search(&query, &TopDocs::with_limit(500).order_by_score())
        .map_err(|error| error.to_string())?;
    let mut seen = HashSet::new();
    let mut results = Vec::new();
    for (_, address) in docs {
        let document = searcher
            .doc::<TantivyDocument>(address)
            .map_err(|error| error.to_string())?;
        let session_id = stored_text(&document, fields.session_id);
        if !seen.insert((stored_text(&document, fields.source_id), session_id)) {
            continue;
        }
        let snippet = snippets.snippet_from_doc(&document).fragment().to_string();
        results.push(result_from_doc(&document, fields, snippet));
        if results.len() == RESULT_LIMIT {
            break;
        }
    }
    Ok(results)
}

#[tauri::command]
pub(crate) async fn sessions_refresh(
    app: AppHandle,
    state: tauri::State<'_, SearchState>,
) -> Result<usize, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || refresh(&app, &state))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn sessions_search(
    query: String,
    state: tauri::State<'_, SearchState>,
) -> Result<Vec<SessionSearchResult>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || search(&state, &query))
        .await
        .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::{
        add_transcript, content_text, fallback_title, open_index, parse_transcript, search,
        Message, SearchState, SessionFile, Transcript,
    };
    use serde_json::json;
    use std::{
        fs,
        sync::{Arc, Mutex},
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn extracts_only_text_blocks() {
        let content = json!([
            {"type": "text", "text": "hello"},
            {"type": "thinking", "thinking": "secret"},
            {"type": "tool_use", "name": "read"}
        ]);
        assert_eq!(content_text(&content), "hello");
    }

    #[test]
    fn title_prefers_first_message_then_directory() {
        assert_eq!(
            fallback_title("/tmp/project", "fix the parser"),
            "fix the parser"
        );
        assert_eq!(fallback_title("/tmp/project", ""), "project");
    }

    fn temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "pimux-search-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn parses_pi_and_claude_transcripts() {
        let root = temp_path("transcripts");
        fs::create_dir_all(&root).unwrap();
        let pi = root.join("pi.jsonl");
        fs::write(
            &pi,
            concat!(
                "{\"type\":\"session\",\"id\":\"pi-1\",\"cwd\":\"/tmp/pi\"}\n",
                "{\"type\":\"message\",\"message\":{\"role\":\"user\",\"content\":\"fix auth\"}}\n"
            ),
        )
        .unwrap();
        let claude = root.join("claude.jsonl");
        fs::write(
            &claude,
            "{\"type\":\"assistant\",\"sessionId\":\"claude-1\",\"cwd\":\"/tmp/claude\",\"message\":{\"role\":\"assistant\",\"content\":[{\"type\":\"text\",\"text\":\"done\"},{\"type\":\"thinking\",\"thinking\":\"hidden\"}]}}\n",
        )
        .unwrap();
        let pi = parse_transcript(&SessionFile {
            path: pi,
            source_id: "builtin:pi",
        })
        .unwrap();
        let claude = parse_transcript(&SessionFile {
            path: claude,
            source_id: "builtin:claudecode",
        })
        .unwrap();
        assert_eq!(
            (pi.session_id.as_str(), pi.title.as_str()),
            ("pi-1", "fix auth")
        );
        assert_eq!(
            (claude.session_id.as_str(), claude.messages[0].text.as_str()),
            ("claude-1", "done")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn finds_session_message_content() {
        let root = temp_path("index");
        let (index, fields) = open_index(&root).unwrap();
        let mut writer = index.writer(20_000_000).unwrap();
        add_transcript(
            &writer,
            fields,
            "/tmp/session.jsonl",
            Transcript {
                source_id: "builtin:pi",
                session_id: "session-1".into(),
                cwd: "/tmp/project".into(),
                title: "Fix parser".into(),
                modified: 1,
                messages: vec![Message {
                    role: "user".into(),
                    text: "Investigate websocket reconnect race".into(),
                }],
            },
        )
        .unwrap();
        writer.commit().unwrap();
        let state = SearchState {
            root: root.clone(),
            lock: Arc::new(Mutex::new(())),
        };
        let results = search(&state, "websocket race").unwrap();
        assert_eq!(results[0].session_id, "session-1");
        assert!(results[0].snippet.contains("websocket"));
        fs::remove_dir_all(root).unwrap();
    }
}
