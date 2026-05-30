use std::path::PathBuf;
use winreg::enums::HKEY_LOCAL_MACHINE;
use winreg::RegKey;

/// Try to read the InstallLocation from a registry subkey under HKLM\Uninstall.
fn try_reg_install_location(subkey: &str) -> Option<PathBuf> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let uninstall = format!("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}", subkey);
    let key = hklm.open_subkey(&uninstall).ok()?;
    let install: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(install))
}

/// Try a WoW6432Node registry path in case the key lives in the 32-bit view on 64-bit Windows.
fn try_reg_wow6432_install_location(subkey: &str) -> Option<PathBuf> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let uninstall = format!(
        "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{}",
        subkey
    );
    let key = hklm.open_subkey(&uninstall).ok()?;
    let install: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(install))
}

/// Given a base install path, test `<base>\Logs` then `<base>\build\Logs`.
fn logs_from_install(install: &PathBuf) -> Option<PathBuf> {
    let logs = install.join("Logs");
    if logs.is_dir() {
        return Some(logs);
    }
    let build_logs = install.join("build").join("Logs");
    if build_logs.is_dir() {
        return Some(build_logs);
    }
    None
}

/// Locate the EFT Logs directory on Windows. Resolution order:
/// a) HKLM WOW6432Node Uninstall\EscapeFromTarkov  → InstallLocation
/// b) HKLM Uninstall\Steam App 3932890             → InstallLocation
/// c) Hardcoded fallback paths.
pub fn find_logs_dir() -> Result<PathBuf, String> {
    // a) Battlestate Games direct install (WOW6432Node)
    if let Some(install) = try_reg_wow6432_install_location("EscapeFromTarkov") {
        if let Some(logs) = logs_from_install(&install) {
            return Ok(logs);
        }
    }

    // b) Steam install
    if let Some(install) = try_reg_install_location("Steam App 3932890") {
        if let Some(logs) = logs_from_install(&install) {
            return Ok(logs);
        }
    }

    // c) Hardcoded fallbacks
    let hardcoded: [&str; 3] = [
        "C:\\Battlestate Games\\EFT\\Logs",
        "C:\\Program Files\\Escape From Tarkov\\Logs",
        "C:\\Program Files (x86)\\Escape From Tarkov\\Logs",
    ];
    for path in &hardcoded {
        let p = PathBuf::from(path);
        if p.is_dir() {
            return Ok(p);
        }
    }

    Err("EFT logs directory not found".into())
}

#[tauri::command]
pub fn get_eft_logs_dir() -> Result<String, String> {
    find_logs_dir().map(|p| p.to_string_lossy().into_owned())
}