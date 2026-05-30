use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use crate::log_watcher;

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct EftConfig {
    #[serde(default)]
    pub install_root: Option<String>,
}

pub struct EftConfigState(pub Arc<Mutex<EftConfig>>);

const CONFIG_FILE: &str = "eft_config.json";

fn config_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(CONFIG_FILE)
}

pub fn load(app: &AppHandle) -> EftConfig {
    let p = config_path(app);
    fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str::<EftConfig>(&s).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, cfg: &EftConfig) -> std::io::Result<()> {
    let p = config_path(app);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(&p, json)
}

fn has_any_application_log(dir: &Path) -> bool {
    let Ok(entries) = fs::read_dir(dir) else { return false; };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_file() && log_watcher::is_application_log(&p) {
            return true;
        }
        if p.is_dir() {
            if let Ok(subentries) = fs::read_dir(&p) {
                for sub in subentries.flatten() {
                    let sp = sub.path();
                    if sp.is_file() && log_watcher::is_application_log(&sp) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

fn logs_dir_under(root: &Path) -> Option<PathBuf> {
    let a = root.join("Logs");
    if a.is_dir() { return Some(a); }
    let b = root.join("build").join("Logs");
    if b.is_dir() { return Some(b); }
    None
}

pub fn resolve_logs_dir(cfg: &EftConfig) -> Result<PathBuf, String> {
    if let Some(root) = cfg.install_root.as_deref() {
        let root_path = PathBuf::from(root);
        if !root_path.is_dir() {
            return Err(format!("Install root does not exist: {}", root));
        }
        match logs_dir_under(&root_path) {
            Some(p) => return Ok(p),
            None => return Err(format!(
                "No Logs or build/Logs subdir under {}", root
            )),
        }
    }
    crate::eft_logs::find_logs_dir()
}

#[tauri::command]
pub fn get_eft_config(state: State<EftConfigState>) -> EftConfig {
    state.0.lock().map(|g| g.clone()).unwrap_or_default()
}

#[tauri::command]
pub fn get_resolved_logs_dir(state: State<EftConfigState>) -> Result<String, String> {
    let cfg = state.0.lock().map_err(|e| e.to_string())?.clone();
    let p = resolve_logs_dir(&cfg)?;
    Ok(p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn set_eft_install_root(
    app: AppHandle,
    state: State<EftConfigState>,
    root: Option<String>,
) -> Result<String, String> {
    let new_cfg = EftConfig { install_root: root.clone() };

    let logs_dir = resolve_logs_dir(&new_cfg)?;
    if root.is_some() && !has_any_application_log(&logs_dir) {
        return Err(format!(
            "No EFT log files found in {}. Pick the folder that contains the EFT executable, not the launcher or saves dir.",
            logs_dir.display()
        ));
    }

    save(&app, &new_cfg).map_err(|e| format!("Failed to save config: {}", e))?;

    {
        let mut g = state.0.lock().map_err(|e| e.to_string())?;
        *g = new_cfg;
    }

    crate::log_watcher::restart(app.clone(), logs_dir.clone());

    Ok(logs_dir.to_string_lossy().into_owned())
}
