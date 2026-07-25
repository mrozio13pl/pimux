use base64::{engine::general_purpose::STANDARD, Engine};
use regex::Regex;
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    sync::OnceLock,
};

const ICON_CANDIDATES: &[&str; 21] = &[
    "favicon.svg",
    "favicon.ico",
    "favicon.png",
    "public/favicon.svg",
    "public/favicon.ico",
    "public/favicon.png",
    "app/favicon.ico",
    "app/favicon.png",
    "app/icon.svg",
    "app/icon.png",
    "app/icon.ico",
    "src/favicon.ico",
    "src/favicon.svg",
    "src/app/favicon.ico",
    "src/app/icon.svg",
    "src/app/icon.png",
    "assets/icon.svg",
    "assets/icon.png",
    "assets/logo.svg",
    "assets/logo.png",
    ".idea/icon.svg",
];

const ICON_SOURCE_FILES: &[&str; 7] = &[
    "index.html",
    "public/index.html",
    "app/routes/__root.tsx",
    "src/routes/__root.tsx",
    "app/root.tsx",
    "src/root.tsx",
    "src/index.html",
];

fn default_workspace() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        return Ok(Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .ok_or("project root unavailable")?
            .to_path_buf());
    }
    std::env::current_dir().map_err(|error| error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceInfo {
    cwd: String,
    icon: Option<String>,
    path: String,
    branch: Option<String>,
    is_git: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectoryEntry {
    path: String,
    absolute_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectoryBreadcrumb {
    label: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DirectoryListing {
    root: String,
    breadcrumbs: Vec<DirectoryBreadcrumb>,
    entries: Vec<DirectoryEntry>,
}

#[tauri::command]
pub(crate) fn workspace_info(cwd: Option<String>) -> Result<WorkspaceInfo, String> {
    let cwd = cwd
        .map(PathBuf::from)
        .map(Ok)
        .unwrap_or_else(default_workspace)?;
    let cwd = cwd.canonicalize().map_err(|error| error.to_string())?;
    if !cwd.is_dir() {
        return Err("workspace path is not a directory".into());
    }
    let git_dir = find_git_dir(&cwd);
    Ok(WorkspaceInfo {
        cwd: cwd.display().to_string(),
        icon: find_workspace_icon(&cwd),
        path: display_path(&cwd),
        branch: git_dir.as_deref().and_then(git_branch),
        is_git: git_dir.is_some(),
    })
}

#[tauri::command]
pub(crate) fn directory_children(
    root: String,
    path: Option<String>,
) -> Result<DirectoryListing, String> {
    let root = PathBuf::from(root)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let relative = path.unwrap_or_default();
    let relative = Path::new(relative.trim_end_matches('/'));
    if relative
        .components()
        .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err("invalid directory path".into());
    }
    let directory = root
        .join(relative)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !directory.is_dir() || !directory.starts_with(&root) {
        return Err("directory is outside picker root".into());
    }

    let mut entries = std::fs::read_dir(&directory)
        .map_err(|error| error.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
        .filter_map(|entry| {
            let absolute_path = entry.path();
            let relative_path = absolute_path.strip_prefix(&root).ok()?;
            Some(DirectoryEntry {
                path: format!("{}/", relative_path.to_string_lossy().replace('\\', "/")),
                absolute_path: absolute_path.display().to_string(),
            })
        })
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.path.to_lowercase());

    let breadcrumbs = directory
        .ancestors()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|path| DirectoryBreadcrumb {
            label: path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.display().to_string()),
            path: path.display().to_string(),
        })
        .collect();

    Ok(DirectoryListing {
        root: root.display().to_string(),
        breadcrumbs,
        entries,
    })
}

fn display_path(cwd: &Path) -> String {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    if let Some(relative) = home.as_deref().and_then(|home| cwd.strip_prefix(home).ok()) {
        return Path::new("~").join(relative).display().to_string();
    }
    cwd.display().to_string()
}

fn find_git_dir(cwd: &Path) -> Option<PathBuf> {
    for ancestor in cwd.ancestors() {
        let marker = ancestor.join(".git");
        if marker.is_dir() {
            return Some(marker);
        }
        if marker.is_file() {
            let contents = std::fs::read_to_string(marker).ok()?;
            let git_dir = PathBuf::from(contents.trim().strip_prefix("gitdir:")?.trim());
            return Some(if git_dir.is_absolute() {
                git_dir
            } else {
                ancestor.join(git_dir)
            });
        }
    }
    None
}

fn git_branch(git_dir: &Path) -> Option<String> {
    let head = std::fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let head = head.trim();
    Some(
        head.strip_prefix("ref: ")
            .map(|reference| {
                reference
                    .strip_prefix("refs/heads/")
                    .unwrap_or(reference)
                    .to_string()
            })
            .unwrap_or_else(|| head.chars().take(7).collect()),
    )
}

fn find_workspace_icon(cwd: &Path) -> Option<String> {
    find_linked_icon(cwd).or_else(|| {
        ICON_CANDIDATES
            .iter()
            .find_map(|candidate| read_icon(&cwd.join(candidate)))
    })
}

fn find_linked_icon(cwd: &Path) -> Option<String> {
    for source in ICON_SOURCE_FILES {
        let source_file = cwd.join(source);
        let Ok(metadata) = source_file.metadata() else {
            continue;
        };
        if !metadata.is_file() || metadata.len() > 1024 * 1024 {
            continue;
        }
        let Ok(contents) = std::fs::read_to_string(&source_file) else {
            continue;
        };
        let Some(href) = linked_icon_href(&contents) else {
            continue;
        };
        if let Some(icon) = resolve_icon_href(cwd, &source_file, &href)
            .into_iter()
            .find_map(|file| read_icon(&file))
        {
            return Some(icon);
        }
    }
    None
}

fn linked_icon_href(contents: &str) -> Option<String> {
    static REL: OnceLock<Regex> = OnceLock::new();
    static HREF: OnceLock<Regex> = OnceLock::new();
    let rel = REL.get_or_init(|| {
        Regex::new(r#"(?i)\brel\s*(?:=|:)\s*[\"'](?:icon|shortcut icon)[\"']"#).unwrap()
    });
    let href =
        HREF.get_or_init(|| Regex::new(r#"(?i)\bhref\s*(?:=|:)\s*[\"']([^\"']+)[\"']"#).unwrap());

    contents
        .split_inclusive(['>', '}'])
        .find(|block| rel.is_match(block))
        .and_then(|block| href.captures(block))
        .and_then(|captures| captures.get(1))
        .map(|href| href.as_str().to_string())
}

fn resolve_icon_href(cwd: &Path, source_file: &Path, href: &str) -> Vec<PathBuf> {
    if href.starts_with("data:") || href.starts_with("//") || href.contains("://") {
        return Vec::new();
    }
    let clean_href = href.split(['?', '#']).next().unwrap_or_default();
    if clean_href.is_empty() {
        return Vec::new();
    }
    if let Some(relative) = clean_href.strip_prefix('/') {
        return vec![cwd.join("public").join(relative), cwd.join(relative)];
    }
    vec![
        source_file.parent().unwrap_or(cwd).join(clean_href),
        cwd.join(clean_href),
    ]
}

fn read_icon(file: &Path) -> Option<String> {
    let metadata = file.metadata().ok()?;
    if !metadata.is_file() || metadata.len() > 512 * 1024 {
        return None;
    }
    let data = std::fs::read(file).ok()?;
    Some(format!(
        "data:{};base64,{}",
        icon_mime(file),
        STANDARD.encode(data)
    ))
}

fn icon_mime(file: &Path) -> &'static str {
    match file
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::{directory_children, git_branch, linked_icon_href, resolve_icon_href};
    use std::path::Path;

    #[test]
    fn finds_and_resolves_local_icons() {
        assert_eq!(
            linked_icon_href(r#"<link href="/icon.svg?v=1" rel="icon">"#).as_deref(),
            Some("/icon.svg?v=1")
        );
        assert_eq!(
            resolve_icon_href(
                Path::new("/workspace"),
                Path::new("/workspace/index.html"),
                "/icon.svg"
            ),
            [
                Path::new("/workspace/public/icon.svg"),
                Path::new("/workspace/icon.svg")
            ]
        );
        assert!(resolve_icon_href(
            Path::new("/workspace"),
            Path::new("/workspace/index.html"),
            "https://example.com/icon.svg"
        )
        .is_empty());
    }

    #[test]
    fn reads_git_branch() {
        let directory = std::env::temp_dir().join(format!("pimux-git-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        std::fs::write(directory.join("HEAD"), "ref: refs/heads/feature/icons\n").unwrap();
        assert_eq!(git_branch(&directory).as_deref(), Some("feature/icons"));
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn folder_picker_rejects_parent_traversal() {
        assert!(directory_children(
            std::env::current_dir().unwrap().display().to_string(),
            Some("../tmp".into())
        )
        .is_err());
    }

    #[test]
    fn folder_picker_lists_direct_children() {
        let root = std::env::temp_dir().join(format!("pimux-folders-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("child/grandchild")).unwrap();
        std::fs::write(root.join("file.txt"), "ignored").unwrap();
        let listing = directory_children(root.display().to_string(), None).unwrap();
        assert_eq!(listing.entries.len(), 1);
        assert_eq!(listing.entries[0].path, "child/");
        assert_eq!(
            listing.breadcrumbs.last().unwrap().label,
            root.file_name().unwrap().to_string_lossy()
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
