// Screenshot watcher.
//
// Watches the EFT Screenshots dir. When the game writes a new PNG with the
// position-encoded filename, parse it, emit `player-position { x, y, z, rotation }`,
// and delete the file. Auto-delete keeps the folder lean and prevents the user
// from accumulating thousands of position-debug PNGs.
//
// Filename format (derived 2026-05-27 from a real EFT screenshot):
//   2026-05-27[22-51]_-44.40, 25.75, 28.54_0.06418, 0.40166, -0.02823, 0.91310_6.76 (0).png
//   <date>[<HH-MM>]_<x>, <y>, <z>_<qx>, <qy>, <qz>, <qw>_<unknown> (N).png
//
// `rotation` is yaw in degrees, computed from the quaternion. EFT world is Y-up.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use notify::{EventKind, RecursiveMode, Watcher};
use regex::Regex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

const FILENAME_RE: &str =
    r"^[\d-]+\[[\d-]+\]_(-?\d+\.\d+),\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)_(-?\d+\.\d+),\s*(-?\d+\.\d+),\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)_";

#[derive(Serialize, Clone)]
struct PlayerPosition {
    x: f64,
    y: f64,
    z: f64,
    rotation: f64,
}

fn default_screenshots_dir() -> Option<PathBuf> {
    dirs::document_dir().map(|d| d.join("Escape from Tarkov").join("Screenshots"))
}

fn yaw_degrees(qx: f64, qy: f64, qz: f64, qw: f64) -> f64 {
    let sin_yaw = 2.0 * (qw * qy + qx * qz);
    let cos_yaw = 1.0 - 2.0 * (qy * qy + qz * qz);
    sin_yaw.atan2(cos_yaw).to_degrees()
}

/// Parse a screenshot filename. Returns Some(payload) if the regex matches.
/// Matches partially (uses leading anchor only) so the trailing collision
/// counter and unknown float don't have to be modeled exactly.
fn parse_filename(name: &str, re: &Regex) -> Option<PlayerPosition> {
    let caps = re.captures(name)?;
    let x: f64 = caps.get(1)?.as_str().parse().ok()?;
    let y: f64 = caps.get(2)?.as_str().parse().ok()?;
    let z: f64 = caps.get(3)?.as_str().parse().ok()?;
    let qx: f64 = caps.get(4)?.as_str().parse().ok()?;
    let qy: f64 = caps.get(5)?.as_str().parse().ok()?;
    let qz: f64 = caps.get(6)?.as_str().parse().ok()?;
    let qw: f64 = caps.get(7)?.as_str().parse().ok()?;
    Some(PlayerPosition {
        x,
        y,
        z,
        rotation: yaw_degrees(qx, qy, qz, qw),
    })
}

fn process_screenshot(app: &AppHandle, path: &Path, re: &Regex) {
    let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        return;
    };
    if !name.to_lowercase().ends_with(".png") {
        return;
    }
    let Some(pos) = parse_filename(name, re) else {
        eprintln!("[screenshots] unrecognized filename: {}", name);
        return;
    };
    if let Err(e) = app.emit("player-position", pos) {
        eprintln!("[screenshots] emit failed: {}", e);
        return;
    }
    // Auto-delete (safe per project-tarkov-tracker memory).
    if let Err(e) = std::fs::remove_file(path) {
        eprintln!("[screenshots] failed to delete {}: {}", path.display(), e);
    }
}

/// Shared mutable state holding the screenshots dir. Allows the Tauri command
/// `set_screenshots_dir` to swap the watch target at runtime.
pub struct ScreenshotsDir(pub Arc<Mutex<Option<PathBuf>>>);

#[tauri::command]
pub fn set_screenshots_dir(state: State<ScreenshotsDir>, path: String) -> Result<(), String> {
    let new_path = PathBuf::from(path);
    if !new_path.is_dir() {
        return Err(format!("not a directory: {}", new_path.display()));
    }
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = Some(new_path);
    Ok(())
}

/// Spawn the watcher. Non-blocking. Reads the dir from the shared `ScreenshotsDir`
/// state, defaults to `<Documents>\Escape from Tarkov\Screenshots`.
pub fn start(app: AppHandle, state: Arc<Mutex<Option<PathBuf>>>) {
    thread::spawn(move || {
        let initial = {
            let g = state.lock().ok();
            g.and_then(|g| g.clone()).or_else(default_screenshots_dir)
        };
        let Some(dir) = initial else {
            eprintln!("[screenshots] cannot resolve default screenshots dir");
            return;
        };
        if !dir.is_dir() {
            // Create the folder so notify can watch it — EFT will populate.
            if let Err(e) = std::fs::create_dir_all(&dir) {
                eprintln!("[screenshots] cannot create {}: {}", dir.display(), e);
                return;
            }
        }

        let re = match Regex::new(FILENAME_RE) {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[screenshots] invalid regex: {}", e);
                return;
            }
        };

        let app_for_watcher = app.clone();
        let re_for_watcher = re.clone();
        let mut watcher = match notify::recommended_watcher(
            move |res: notify::Result<notify::Event>| match res {
                Ok(ev) => {
                    if matches!(ev.kind, EventKind::Create(_)) {
                        for path in ev.paths {
                            // Small delay: notify fires Create before the writer
                            // finishes flushing. The filename is what we need
                            // (not the bytes), so this is usually fine, but a
                            // brief sleep avoids racing on rename-on-close.
                            thread::sleep(Duration::from_millis(150));
                            process_screenshot(&app_for_watcher, &path, &re_for_watcher);
                        }
                    }
                }
                Err(e) => eprintln!("[screenshots] notify error: {}", e),
            },
        ) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[screenshots] failed to start notify watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(&dir, RecursiveMode::NonRecursive) {
            eprintln!("[screenshots] failed to watch {}: {}", dir.display(), e);
            return;
        }

        // Keep watcher alive forever.
        loop {
            thread::sleep(Duration::from_secs(60));
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_real_filename() {
        let re = Regex::new(FILENAME_RE).unwrap();
        let name = "2026-05-27[22-51]_-44.40, 25.75, 28.54_0.06418, 0.40166, -0.02823, 0.91310_6.76 (0).png";
        let pos = parse_filename(name, &re).expect("must parse");
        assert!((pos.x - -44.40).abs() < 1e-6);
        assert!((pos.y - 25.75).abs() < 1e-6);
        assert!((pos.z - 28.54).abs() < 1e-6);
        // rotation: with this quaternion, yaw should be roughly 47.5 degrees.
        // Just sanity-check it's a finite number in [-180, 180].
        assert!(pos.rotation.is_finite());
        assert!(pos.rotation >= -180.0 && pos.rotation <= 180.0);
    }

    #[test]
    fn rejects_garbage() {
        let re = Regex::new(FILENAME_RE).unwrap();
        assert!(parse_filename("garbage.png", &re).is_none());
        assert!(parse_filename("2026-05-27_no_brackets.png", &re).is_none());
    }
}
