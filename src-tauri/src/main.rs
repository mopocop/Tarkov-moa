#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod eft_config;
mod eft_logs;
mod log_watcher;
mod screenshots;

use std::sync::{Arc, Mutex};
use tauri::Manager;

fn main() {
    let screenshots_dir = Arc::new(Mutex::new(None));
    let screenshots_state = screenshots::ScreenshotsDir(screenshots_dir.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(screenshots_state)
        .setup(move |app| {
            let handle = app.handle().clone();

            // EFT config: load persisted user choice, fall back to defaults.
            let cfg = eft_config::load(&handle);
            let cfg_state = eft_config::EftConfigState(std::sync::Arc::new(std::sync::Mutex::new(cfg)));
            let cfg_arc = cfg_state.0.clone();
            app.manage(cfg_state);

            // Resolve logs dir using current config; start watcher.
            let logs_dir_result = {
                let guard = cfg_arc.lock().map_err(|e| e.to_string())?;
                eft_config::resolve_logs_dir(&guard)
            };
            log_watcher::start_with_resolver(handle.clone(), logs_dir_result);

            // Screenshots watcher: target dir is independent of install root.
            screenshots::start(handle, screenshots_dir.clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            eft_config::get_eft_config,
            eft_config::get_resolved_logs_dir,
            eft_config::set_eft_install_root,
            eft_logs::get_eft_logs_dir,
            log_watcher::replay_past_logs_cmd,
            screenshots::set_screenshots_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
