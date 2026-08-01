use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct View {
    pub(crate) id: String,
    pub(crate) title: String,
    pub(crate) description: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) cwd: Option<String>,
    pub(crate) source_id: Option<String>,
    pub(crate) session_id: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) lock_title: Option<bool>,
    pub(crate) pinned: Option<bool>,
    pub(crate) archived: Option<bool>,
    pub(crate) last_active_at: Option<u64>,
}

fn views_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("views.json"))
}

#[tauri::command]
pub(crate) fn views_load(app: AppHandle) -> Result<Vec<View>, String> {
    let path = views_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&contents).map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn views_save(app: AppHandle, views: Vec<View>) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(&views).map_err(|error| error.to_string())?;
    std::fs::write(views_path(&app)?, contents).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::View;

    #[test]
    fn old_views_load_without_launch_fields() {
        let view: View = serde_json::from_str(r#"{"id":"1","title":"Old"}"#).unwrap();
        assert!(view.cwd.is_none());
        assert!(view.source_id.is_none());
        assert!(view.session_id.is_none());
        assert!(view.model.is_none());
        assert!(view.lock_title.is_none());
        assert!(view.pinned.is_none());
        assert!(view.archived.is_none());
        assert!(view.last_active_at.is_none());

        let archived: View =
            serde_json::from_str(r#"{"id":"2","title":"Archived","archived":true}"#).unwrap();
        assert_eq!(archived.archived, Some(true));
    }
}
