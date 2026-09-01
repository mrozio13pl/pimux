use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};

static FILE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CustomSource {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) executable: String,
    pub(crate) icon: Option<PathBuf>,
    #[serde(default)]
    pub(crate) icon_monochrome: bool,
}

fn sources_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("custom-sources.json"))
}

fn load(path: &std::path::Path) -> Result<Vec<CustomSource>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

fn save(path: &std::path::Path, sources: &[CustomSource]) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    let contents = serde_json::to_vec_pretty(sources).map_err(|error| error.to_string())?;
    std::fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    match std::fs::rename(&temporary, path) {
        Ok(()) => Ok(()),
        #[cfg(windows)]
        Err(_) if path.exists() => {
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
            std::fs::rename(temporary, path).map_err(|error| error.to_string())
        }
        Err(error) => Err(error.to_string()),
    }
}

#[derive(Deserialize)]
struct UnpkgMetadata {
    version: String,
    files: Vec<UnpkgFile>,
}

#[derive(Deserialize)]
struct UnpkgFile {
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LobeHubCatalog {
    version: String,
    icons: Vec<LobeHubIcon>,
}

#[derive(Serialize)]
pub(crate) struct LobeHubIcon {
    slug: String,
    url: String,
}

fn valid_lobehub_part(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_".contains(character))
}

fn validate_id(id: &str) -> bool {
    let Some(suffix) = id.strip_prefix("custom:") else {
        return false;
    };
    !suffix.is_empty()
        && suffix.len() <= 64
        && suffix
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

pub(crate) fn parse_command(value: &str) -> Result<(PathBuf, Vec<String>), String> {
    if value.len() > 4096 || value.chars().any(char::is_control) {
        return Err("invalid executable".into());
    }
    let mut tokens = shell_words::split(value)
        .map_err(|_| "invalid executable command")?
        .into_iter();
    let program = tokens.next().ok_or("invalid executable")?;
    Ok((validate_executable(program.into())?, tokens.collect()))
}

fn normalize_command(value: &str) -> Result<String, String> {
    let (program, args) = parse_command(value)?;
    let mut parts = vec![program.to_string_lossy().into_owned()];
    parts.extend(args);
    Ok(shell_words::join(parts))
}

fn validate_executable(path: PathBuf) -> Result<PathBuf, String> {
    let value = path.to_string_lossy();
    if value.is_empty() || value.len() > 1024 || value.chars().any(char::is_control) {
        return Err("invalid executable".into());
    }
    if path.components().count() == 1 {
        if !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_+".contains(character))
        {
            return Err("invalid executable command".into());
        }
        return Ok(path);
    }
    let path = path
        .canonicalize()
        .map_err(|error| format!("invalid executable: {error}"))?;
    if !path.is_file() {
        return Err("executable is not a file".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if path
            .metadata()
            .map_err(|error| error.to_string())?
            .permissions()
            .mode()
            & 0o111
            == 0
        {
            return Err("file is not executable".into());
        }
    }
    Ok(path)
}

fn copy_icon(app: &AppHandle, id: &str, icon: PathBuf) -> Result<PathBuf, String> {
    let icon = icon
        .canonicalize()
        .map_err(|error| format!("invalid icon: {error}"))?;
    let extension = icon
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|extension| matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp"))
        .ok_or("icon must be PNG, JPEG, or WebP")?;
    if icon.metadata().map_err(|error| error.to_string())?.len() > 512 * 1024 {
        return Err("icon must be smaller than 512 KB".into());
    }
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("custom-source-icons");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let destination = directory.join(format!(
        "{}.{}",
        id.trim_start_matches("custom:"),
        extension
    ));
    std::fs::copy(&icon, &destination).map_err(|error| error.to_string())?;
    if icon.starts_with(std::env::temp_dir().join("pimux-lobehub-icons")) {
        let _ = std::fs::remove_file(icon);
    }
    Ok(destination)
}

#[tauri::command]
pub(crate) fn custom_sources_load(app: AppHandle) -> Result<Vec<CustomSource>, String> {
    let _lock = FILE_LOCK
        .lock()
        .map_err(|_| "custom source storage unavailable")?;
    load(&sources_path(&app)?)
}

#[tauri::command]
pub(crate) fn custom_source_add(
    app: AppHandle,
    id: String,
    title: String,
    executable: String,
    icon: Option<PathBuf>,
    icon_monochrome: bool,
) -> Result<CustomSource, String> {
    if !validate_id(&id) {
        return Err("invalid custom source ID".into());
    }
    let title = title.trim();
    if title.is_empty() || title.len() > 64 || title.chars().any(char::is_control) {
        return Err("invalid custom source title".into());
    }
    let source = CustomSource {
        executable: normalize_command(&executable)?,
        icon: icon.map(|icon| copy_icon(&app, &id, icon)).transpose()?,
        icon_monochrome,
        id,
        title: title.to_string(),
    };
    let _lock = FILE_LOCK
        .lock()
        .map_err(|_| "custom source storage unavailable")?;
    let path = sources_path(&app)?;
    let mut sources = load(&path)?;
    if sources.iter().any(|existing| existing.id == source.id) {
        return Err("custom source already exists".into());
    }
    sources.push(source.clone());
    save(&path, &sources)?;
    Ok(source)
}

#[tauri::command]
pub(crate) fn custom_source_update(
    app: AppHandle,
    id: String,
    title: String,
    executable: String,
    icon: Option<PathBuf>,
    icon_monochrome: bool,
) -> Result<CustomSource, String> {
    if !validate_id(&id) {
        return Err("invalid custom source ID".into());
    }
    let title = title.trim();
    if title.is_empty() || title.len() > 64 || title.chars().any(char::is_control) {
        return Err("invalid custom source title".into());
    }
    let executable = normalize_command(&executable)?;
    let _lock = FILE_LOCK
        .lock()
        .map_err(|_| "custom source storage unavailable")?;
    let path = sources_path(&app)?;
    let mut sources = load(&path)?;
    let index = sources
        .iter()
        .position(|source| source.id == id)
        .ok_or("unknown custom source")?;
    let old_icon = sources[index].icon.clone();
    let icon = if icon == old_icon {
        old_icon.clone()
    } else {
        icon.map(|icon| copy_icon(&app, &id, icon)).transpose()?
    };
    let source = CustomSource {
        id,
        title: title.to_string(),
        executable,
        icon,
        icon_monochrome,
    };
    sources[index] = source.clone();
    save(&path, &sources)?;
    if old_icon != source.icon {
        if let Some(old_icon) = old_icon {
            let _ = std::fs::remove_file(old_icon);
        }
    }
    Ok(source)
}

#[tauri::command]
pub(crate) fn custom_source_remove(app: AppHandle, id: String) -> Result<(), String> {
    if !validate_id(&id) {
        return Err("invalid custom source ID".into());
    }
    let _lock = FILE_LOCK
        .lock()
        .map_err(|_| "custom source storage unavailable")?;
    let path = sources_path(&app)?;
    let mut sources = load(&path)?;
    let icon = sources
        .iter()
        .find(|source| source.id == id)
        .and_then(|source| source.icon.clone());
    sources.retain(|source| source.id != id);
    save(&path, &sources)?;
    if let Some(icon) = icon {
        let _ = std::fs::remove_file(icon);
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn lobehub_icons_load() -> Result<LobeHubCatalog, String> {
    let metadata = reqwest::get("https://unpkg.com/@lobehub/icons-static-png@latest/?meta")
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .json::<UnpkgMetadata>()
        .await
        .map_err(|error| error.to_string())?;
    if !valid_lobehub_part(&metadata.version) {
        return Err("invalid LobeHub icon version".into());
    }
    let mut icons = metadata
        .files
        .into_iter()
        .filter_map(|file| {
            let slug = file.path.strip_prefix("/light/")?.strip_suffix(".png")?;
            (!slug.contains('/') && valid_lobehub_part(slug)).then(|| LobeHubIcon {
                slug: slug.to_string(),
                url: format!(
                    "https://unpkg.com/@lobehub/icons-static-png@{}/light/{slug}.png",
                    metadata.version
                ),
            })
        })
        .collect::<Vec<_>>();
    icons.sort_by(|left, right| left.slug.cmp(&right.slug));
    Ok(LobeHubCatalog {
        version: metadata.version,
        icons,
    })
}

#[tauri::command]
pub(crate) async fn lobehub_icon_stage(slug: String, version: String) -> Result<PathBuf, String> {
    if !valid_lobehub_part(&slug) || !valid_lobehub_part(&version) {
        return Err("invalid LobeHub icon".into());
    }
    let url = format!("https://unpkg.com/@lobehub/icons-static-png@{version}/light/{slug}.png");
    let bytes = reqwest::get(url)
        .await
        .map_err(|error| error.to_string())?
        .error_for_status()
        .map_err(|error| error.to_string())?
        .bytes()
        .await
        .map_err(|error| error.to_string())?;
    if bytes.len() > 512 * 1024 || !bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("invalid LobeHub icon image".into());
    }
    let directory = std::env::temp_dir().join("pimux-lobehub-icons");
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let path = directory.join(format!("{slug}.png"));
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path)
}

pub(crate) fn custom_source_command(
    app: &AppHandle,
    id: &str,
) -> Result<(PathBuf, Vec<String>), String> {
    if !validate_id(id) {
        return Err("invalid custom source ID".into());
    }
    let _lock = FILE_LOCK
        .lock()
        .map_err(|_| "custom source storage unavailable")?;
    let source = load(&sources_path(app)?)?
        .into_iter()
        .find(|source| source.id == id)
        .ok_or("unknown custom source")?;
    parse_command(&source.executable)
}

#[cfg(test)]
mod tests {
    use super::{normalize_command, parse_command, validate_executable, validate_id};

    #[test]
    fn custom_source_ids_are_namespaced() {
        let old: super::CustomSource =
            serde_json::from_str(r#"{"id":"custom:old","title":"Old","executable":"old"}"#)
                .unwrap();
        assert!(old.icon.is_none());
        assert!(!old.icon_monochrome);
        assert!(validate_id("custom:123e4567-e89b-12d3-a456-426614174000"));
        assert!(!validate_id("builtin:shell"));
        assert!(!validate_id("custom:../shell"));
        assert!(validate_executable("aider".into()).is_ok());
        assert!(validate_executable("aider --help".into()).is_err());
        let (program, args) = parse_command("aider --model gpt-5 \"my prompt\"").unwrap();
        assert_eq!(program, std::path::PathBuf::from("aider"));
        assert_eq!(args, ["--model", "gpt-5", "my prompt"]);
        assert_eq!(normalize_command("  aider  --yes ").unwrap(), "aider --yes");
        assert!(parse_command("aider \"unclosed").is_err());
        assert!(super::valid_lobehub_part("claude-color"));
        assert!(!super::valid_lobehub_part("../claude"));
    }

    #[cfg(unix)]
    #[test]
    fn custom_source_must_be_executable() {
        use std::os::unix::fs::PermissionsExt;
        let path = std::env::temp_dir().join(format!("pimux-source-{}", std::process::id()));
        std::fs::write(&path, b"#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert!(validate_executable(path.clone()).is_err());
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o700)).unwrap();
        assert!(validate_executable(path.clone()).is_ok());
        let _ = std::fs::remove_file(path);
    }
}
